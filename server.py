from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Awaitable, Callable, Dict, List, Tuple, Optional, Any

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
import os
import psycopg2
from contextlib import contextmanager
import httpx
from pydantic import BaseModel, Field, ValidationError, field_validator


@dataclass(frozen=True)
class MountainsWidget:
    identifier: str
    title: str
    template_uri: str
    invoking: str
    invoked: str
    html: str


ASSETS_DIR = Path(__file__).resolve().parent / "assets"
MIME_TYPE = "text/html+skybridge"


@lru_cache(maxsize=None)
def _load_widget_html(component_name: str) -> str:
    html_path = ASSETS_DIR / f"{component_name}.html"
    if html_path.exists():
        return html_path.read_text(encoding="utf8")

    fallback_candidates = sorted(ASSETS_DIR.glob(f"{component_name}-*.html"))
    if fallback_candidates:
        return fallback_candidates[-1].read_text(encoding="utf8")

    raise FileNotFoundError(
        f'Widget HTML for "{component_name}" not found in {ASSETS_DIR}. '
        "Make sure the assets directory contains the mountains.html file."
    )


widget = MountainsWidget(
    identifier="mountains-map",
    title="Show Mountains Map",
    template_uri="ui://widget/mountains.html",
    invoking="Searching for mountains...",
    invoked="Found mountains",
    html=_load_widget_html("mountains"),
)

mountain_info_widget = MountainsWidget(
    identifier="mountain-info",
    title="Mountain Information",
    template_uri="ui://widget/mountain-info.html",
    invoking="Loading mountain information...",
    invoked="Mountain information loaded",
    html=_load_widget_html("mountain-info"),
)


WIDGETS_BY_ID: Dict[str, MountainsWidget] = {
    widget.identifier: widget,
    mountain_info_widget.identifier: mountain_info_widget,
}
WIDGETS_BY_URI: Dict[str, MountainsWidget] = {
    widget.template_uri: widget,
    mountain_info_widget.template_uri: mountain_info_widget,
}


mcp = FastMCP(
    name="14ers-mcp",
    stateless_http=True,
)


# Database connection management
def _get_db_config() -> Dict[str, str]:
    """Load and return database configuration from environment variables."""
    load_dotenv()
    # Default to "postgres" for Supabase if dbname is not set
    dbname = os.getenv("dbname") or "postgres"
    user = os.getenv("user")
    password = os.getenv("password")
    host = os.getenv("host")
    port = os.getenv("port")
    
    # Validate required environment variables
    if not user:
        raise ValueError("Environment variable 'user' is required but not set")
    if not password:
        raise ValueError("Environment variable 'password' is required but not set")
    if not host:
        raise ValueError("Environment variable 'host' is required but not set")
    if not port:
        raise ValueError("Environment variable 'port' is required but not set")
    
    return {
        "user": user,
        "password": password,
        "host": host,
        "port": port,
        "dbname": dbname,
    }


@contextmanager
def _get_db_connection():
    """Context manager for database connections. Ensures proper cleanup."""
    config = _get_db_config()
    connection = None
    try:
        connection = psycopg2.connect(
            user=config["user"],
            password=config["password"],
            host=config["host"],
            port=config["port"],
            dbname=config["dbname"],
        )
        print("Connection successful!")
        yield connection
    except Exception as e:
        print(f"Database connection error: {e}")
        raise
    finally:
        if connection:
            connection.close()
            print("Connection closed.")


def _execute_query(query: str, params: Optional[List[Any]] = None) -> List[Tuple]:
    """Execute a SQL query and return the results. Handles connection management."""
    try:
        with _get_db_connection() as connection:
            cursor = connection.cursor()
            cursor.execute(query, params or [])
            results = cursor.fetchall()
            cursor.close()
            return results
    except Exception as e:
        print(f"Query execution error: {e}")
        raise


# Constants for mountains query
_MOUNTAINS_SELECT_FIELDS = "mountain_id, mountain_name, rank, elevation, mountain_range, county, latitude, longitude, nearby_towns, image_filename, mountain_url"
_MOUNTAINS_IMAGE_BASE_URL = "https://kxvaohpqmhdtptwnaoyb.supabase.co/storage/v1/object/public/mountains/"
_MOUNTAINS_VALID_ORDER_BY = {"elevation", "rank"}
_MOUNTAINS_VALID_ORDER_DIRECTION = {"ASC", "DESC"}
_MOUNTAINS_MAX_LIMIT = 1000
_MOUNTAINS_RANK_FILTERS = {
    "exclude_unranked": " AND rank IS NOT NULL",
    "only_unranked": " AND rank IS NULL",
    "include_all": "",
}

# Constants for routes query
_ROUTES_SELECT_FIELDS = "mountain_name, route_name, route_difficulty, roundtrip_distance, elevation_gain, \"range\", snow, snow_difficulty, risk_factor_exposure, risk_factor_rockfall, risk_factor_route_finding, risk_factor_commitment, route_url, standard"
_ROUTES_VALID_ORDER_BY = {"roundtrip_distance", "elevation_gain", "route_difficulty", "mountain_name"}
_ROUTES_VALID_ORDER_DIRECTION = {"ASC", "DESC"}
_ROUTES_MAX_LIMIT = 1000

# Constants for weather
FORECAST_PERIODS = 7  # Number of forecast periods to show
NWS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


# Pydantic models for input validation
class MountainsInput(BaseModel):
    """Schema for get_mountains tool."""
    limit: Optional[int] = Field(default=10, ge=1, le=1000)
    min_elevation: Optional[int] = None
    max_elevation: Optional[int] = None
    rank_filter: Optional[str] = None
    name_search: Optional[str] = None
    mountain_range: Optional[str] = None
    county: Optional[str] = None
    nearby_towns: Optional[str] = None
    order_by: Optional[str] = Field(default="elevation")
    order_direction: Optional[str] = Field(default="DESC")
    
    @field_validator("order_by")
    @classmethod
    def validate_order_by(cls, v: Optional[str]) -> str:
        if v is None or v not in _MOUNTAINS_VALID_ORDER_BY:
            return "elevation"
        return v
    
    @field_validator("order_direction")
    @classmethod
    def validate_order_direction(cls, v: Optional[str]) -> str:
        if v is None:
            return "DESC"
        v_upper = v.upper()
        if v_upper not in _MOUNTAINS_VALID_ORDER_DIRECTION:
            return "DESC"
        return v_upper


class RoutesInput(BaseModel):
    """Schema for get_routes tool."""
    limit: Optional[int] = Field(default=10, ge=1, le=1000)
    mountain_name: Optional[str] = None
    route_name: Optional[str] = None
    route_difficulty: Optional[List[str]] = None
    range: Optional[str] = None
    snow: Optional[bool] = None
    standard: Optional[bool] = None
    min_distance: Optional[float] = None
    max_distance: Optional[float] = None
    min_elevation_gain: Optional[int] = None
    max_elevation_gain: Optional[int] = None
    order_by: Optional[str] = Field(default="mountain_name")
    order_direction: Optional[str] = Field(default="ASC")
    
    @field_validator("order_by")
    @classmethod
    def validate_order_by(cls, v: Optional[str]) -> str:
        if v is None or v not in _ROUTES_VALID_ORDER_BY:
            return "mountain_name"
        return v
    
    @field_validator("order_direction")
    @classmethod
    def validate_order_direction(cls, v: Optional[str]) -> str:
        if v is None:
            return "ASC"
        v_upper = v.upper()
        if v_upper not in _ROUTES_VALID_ORDER_DIRECTION:
            return "ASC"
        return v_upper


class MountainInfoInput(BaseModel):
    """Schema for get_mountain_info tool."""
    mountain_name: str = Field(..., description="The name of the mountain to look up")


class WeatherInput(BaseModel):
    """Schema for get_weather tool."""
    mountain_name: str = Field(..., description="The name of the mountain to get weather for")


def _mountains_add_filter(query: str, params: List, condition: str, value: Any, use_like: bool = False) -> Tuple[str, List]:
    """Helper to add a filter condition to the mountains query if value is present."""
    if value is None or value == "":
        return query, params
    
    if use_like:
        return query + f" AND {condition} ILIKE %s", params + [f"%{value}%"]
    return query + f" AND {condition} %s", params + [value]


def _mountains_format_row(row: Tuple) -> str:
    """Format a single mountain row into a readable string."""
    mountain_id, mountain_name, rank, elevation, mountain_range_val, county_val, latitude, longitude, nearby_towns_val, image_filename, mountain_url = row
    
    # Build fields dictionary with all available data
    fields = {
        "ID": mountain_id,
        "Name": mountain_name,
        "Elevation": f"{elevation}ft",
        "Rank": rank if rank is not None else None,
        "Range": mountain_range_val,
        "County": county_val,
        "Location": f"{latitude}, {longitude}" if latitude and longitude else None,
        "Nearby Towns": nearby_towns_val,
    }
    
    # Filter out None values and join
    return "\n".join(f"{k}: {v}" for k, v in fields.items() if v is not None)


def _mountains_row_to_dict(row: Tuple) -> Dict[str, Any]:
    """Convert a mountain row to a dictionary for structured content."""
    mountain_id, mountain_name, rank, elevation, mountain_range_val, county_val, latitude, longitude, nearby_towns_val, image_filename, mountain_url = row
    
    # Construct image URL if filename exists
    image_url = None
    if image_filename:
        image_url = f"{_MOUNTAINS_IMAGE_BASE_URL}{image_filename}"
    
    return {
        "id": mountain_id,
        "name": mountain_name,
        "rank": rank,
        "elevation": elevation,
        "elevation_ft": f"{elevation}ft",
        "range": mountain_range_val,
        "county": county_val,
        "latitude": float(latitude) if latitude else None,
        "longitude": float(longitude) if longitude else None,
        "nearby_towns": nearby_towns_val,
        "image_url": image_url,
        "image_filename": image_filename,
        "mountain_url": mountain_url,
    }


def _routes_add_filter(query: str, params: List, condition: str, value: Any, use_like: bool = False) -> Tuple[str, List]:
    """Helper to add a filter condition to the routes query if value is present."""
    if value is None or value == "":
        return query, params
    
    if use_like:
        return query + f" AND {condition} ILIKE %s", params + [f"%{value}%"]
    return query + f" AND {condition} = %s", params + [value]


def _routes_format_row(row: Tuple) -> str:
    """Format a single route row into a readable string."""
    mountain_name, route_name, route_difficulty, roundtrip_distance, elevation_gain, range_val, snow, snow_difficulty, risk_exposure, risk_rockfall, risk_route_finding, risk_commitment, route_url, standard = row
    
    # Build fields dictionary with all available data
    fields = {
        "Mountain": mountain_name,
        "Route Name": route_name,
        "Difficulty": route_difficulty,
        "Roundtrip Distance": f"{roundtrip_distance} miles" if roundtrip_distance else None,
        "Elevation Gain": f"{elevation_gain}ft" if elevation_gain else None,
        "Range": range_val,
        "Snow Route": "Yes" if snow else "No" if snow is not None else None,
        "Snow Difficulty": snow_difficulty if snow else None,
        "Risk - Exposure": risk_exposure,
        "Risk - Rockfall": risk_rockfall,
        "Risk - Route Finding": risk_route_finding,
        "Risk - Commitment": risk_commitment,
        "Standard Route": "Yes" if standard else "No" if standard is not None else None,
        "URL": route_url,
    }
    
    # Filter out None values and join
    return "\n".join(f"{k}: {v}" for k, v in fields.items() if v is not None)


def _routes_row_to_dict(row: Tuple) -> Dict[str, Any]:
    """Convert a route row to a dictionary for structured content."""
    mountain_name, route_name, route_difficulty, roundtrip_distance, elevation_gain, range_val, snow, snow_difficulty, risk_exposure, risk_rockfall, risk_route_finding, risk_commitment, route_url, standard = row
    
    result = {
        "mountain_name": mountain_name,
        "route_name": route_name,
        "route_difficulty": route_difficulty,
        "roundtrip_distance": float(roundtrip_distance) if roundtrip_distance else None,
        "elevation_gain": int(elevation_gain) if elevation_gain else None,
        "range": range_val,
        "snow": bool(snow) if snow is not None else None,
        "risk_factor_exposure": risk_exposure,
        "risk_factor_rockfall": risk_rockfall,
        "risk_factor_route_finding": risk_route_finding,
        "risk_factor_commitment": risk_commitment,
        "route_url": route_url,
        "standard": bool(standard) if standard is not None else None,
    }
    
    # Only include snow_difficulty if snow is True
    if snow:
        result["snow_difficulty"] = snow_difficulty
    
    return result


def _resource_description(widget: MountainsWidget) -> str:
    return f"{widget.title} widget markup"


def _tool_meta(widget: MountainsWidget) -> Dict[str, Any]:
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }


def _tool_invocation_meta(widget: MountainsWidget) -> Dict[str, Any]:
    return {
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
    }


# Tool execution handlers - separate functions for each tool's logic
async def _query_mountains(arguments: Dict) -> types.CallToolResult:
    """Query the mountains table with optional filters and sorting."""
    
    # Extract arguments (already validated by Pydantic with defaults applied)
    limit = arguments.get("limit", 10)
    rank_filter = arguments.get("rank_filter")
    order_by = arguments.get("order_by", "elevation")
    order_direction = arguments.get("order_direction", "DESC")

    # Build the query dynamically
    query = f"SELECT {_MOUNTAINS_SELECT_FIELDS} FROM mountains WHERE 1=1"
    params = []
    
    # Handle rank filter with a cleaner approach
    rank_clause = _MOUNTAINS_RANK_FILTERS.get(
        rank_filter if rank_filter else "exclude_unranked",
        None
    )
    
    if rank_clause is None:
        # Custom rank value (e.g., "1", "2") - convert to integer
        try:
            rank_value = int(rank_filter)
            query += " AND rank = %s"
            params.append(rank_value)
        except (ValueError, TypeError):
            # Invalid rank value, skip this filter
            pass
    else:
        query += rank_clause
    
    # Add filters using helper function
    # Note: use_like=True means ILIKE (case-insensitive partial matching) is used, which handles typing issues
    filter_specs = [
        ("elevation >=", arguments.get("min_elevation"), False),
        ("elevation <=", arguments.get("max_elevation"), False),
        ("mountain_name", arguments.get("name_search"), True),
        ("mountain_range", arguments.get("mountain_range"), True),  # Uses ILIKE for flexible matching
        ("county", arguments.get("county"), True),
        ("nearby_towns", arguments.get("nearby_towns"), True),
    ]
    
    for condition, value, use_like in filter_specs:
        query, params = _mountains_add_filter(query, params, condition, value, use_like)
    
    # Add ordering (already validated by Pydantic)
    query += f" ORDER BY {order_by} {order_direction}"
    
    # Add limit
    if limit and limit > 0:
        query += " LIMIT %s"
        params.append(min(limit, _MOUNTAINS_MAX_LIMIT))
    
    query += ";"
    
    print(f"Executing query: {query}")
    print(f"Query parameters: {params}")

    # Execute query
    try:
        results = _execute_query(query, params)
        
        if not results:
            result_text = (
                "No mountains found matching the criteria. "
                "Note: By default, unranked mountains are excluded. "
                "Try using 'rank_filter: \"include_all\"' to include all mountains."
            )
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=result_text)],
                structuredContent={"mountains": []},
            )
        else:
            formatted_mountains = [_mountains_format_row(row) for row in results]
            result_text = f"Found {len(results)} mountain(s):\n\n" + "\n\n".join(formatted_mountains)
            
            # Convert results to structured format for the widget
            mountains_data = [_mountains_row_to_dict(row) for row in results]
            
            # Add presentation format instructions to structured content
            structured_content = {"mountains": mountains_data}
            if len(results) > 1:
                structured_content["formatting_instructions"] = "Use a table when presenting multiple mountains to the user. After showing results, suggest: checking details for a specific mountain, finding routes, or checking weather conditions."
            
            meta = _tool_invocation_meta(widget)
            
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=result_text)],
                structuredContent=structured_content,
                _meta=meta,
            )

    except Exception as e:
        error_msg = f"Failed to query mountains: {e}"
        print(error_msg)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=error_msg)],
            isError=True,
        )


async def _query_routes(arguments: Dict) -> types.CallToolResult:
    """Query the routes table with optional filters and sorting."""
    
    # Extract arguments (already validated by Pydantic with defaults applied)
    limit = arguments.get("limit", 10)
    order_by = arguments.get("order_by", "mountain_name")
    order_direction = arguments.get("order_direction", "ASC")

    # Build the query dynamically
    query = f"SELECT {_ROUTES_SELECT_FIELDS} FROM routes WHERE 1=1"
    params = []
    
    # Add filters using helper function
    # Note: use_like=True means ILIKE (case-insensitive partial matching) is used, which handles typing issues
    filter_specs = [
        ("mountain_name", arguments.get("mountain_name"), True),
        ("route_name", arguments.get("route_name"), True),
        ("\"range\"", arguments.get("range"), True),  # Uses ILIKE for flexible matching
    ]
    
    for condition, value, use_like in filter_specs:
        query, params = _routes_add_filter(query, params, condition, value, use_like)
    
    # Handle route_difficulty separately since it can be a list
    route_difficulty = arguments.get("route_difficulty")
    if route_difficulty:
        if isinstance(route_difficulty, list) and len(route_difficulty) > 0:
            # Use IN clause for multiple values
            placeholders = ",".join(["%s"] * len(route_difficulty))
            query += f" AND route_difficulty IN ({placeholders})"
            params.extend(route_difficulty)
        elif isinstance(route_difficulty, str):
            # Handle single string value for backward compatibility
            query += " AND route_difficulty = %s"
            params.append(route_difficulty)
    
    # Handle boolean filters
    if arguments.get("snow") is not None:
        query += " AND snow = %s"
        params.append(arguments.get("snow"))
    
    if arguments.get("standard") is not None:
        query += " AND standard = %s"
        params.append(arguments.get("standard"))
    
    # Handle numeric range filters
    if arguments.get("min_distance") is not None:
        query += " AND roundtrip_distance >= %s"
        params.append(arguments.get("min_distance"))
    
    if arguments.get("max_distance") is not None:
        query += " AND roundtrip_distance <= %s"
        params.append(arguments.get("max_distance"))
    
    if arguments.get("min_elevation_gain") is not None:
        query += " AND elevation_gain >= %s"
        params.append(arguments.get("min_elevation_gain"))
    
    if arguments.get("max_elevation_gain") is not None:
        query += " AND elevation_gain <= %s"
        params.append(arguments.get("max_elevation_gain"))
    
    # Add ordering (already validated by Pydantic)
    query += f" ORDER BY {order_by} {order_direction}"
    
    # Add limit
    if limit and limit > 0:
        query += " LIMIT %s"
        params.append(min(limit, _ROUTES_MAX_LIMIT))
    
    query += ";"
    
    print(f"Executing query: {query}")
    print(f"Query parameters: {params}")

    # Execute query
    try:
        results = _execute_query(query, params)
        
        if not results:
            result_text = "No routes found matching the criteria."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=result_text)],
                structuredContent={"routes": []},
            )
        else:
            formatted_routes = [_routes_format_row(row) for row in results]
            result_text = f"Found {len(results)} route(s):\n\n" + "\n\n".join(formatted_routes)
            
            # Convert results to structured format
            routes_data = [_routes_row_to_dict(row) for row in results]
            
            # Add presentation format instructions to structured content
            structured_content = {"routes": routes_data}
            if len(results) > 1:
                structured_content["formatting_instructions"] = "Use a table when presenting multiple routes. Provide personalized recommendations based on user preferences (experience level, distance, difficulty). After showing routes, suggest checking weather with get_weather if not already done."
            
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=result_text)],
                structuredContent=structured_content,
            )

    except Exception as e:
        error_msg = f"Failed to query routes: {e}"
        print(error_msg)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=error_msg)],
            isError=True,
        )


async def _get_mountain_info(arguments: Dict) -> types.CallToolResult:
    """Get detailed information about a specific mountain including route count."""
    
    # Arguments already validated by Pydantic (mountain_name is required)
    mountain_name = arguments.get("mountain_name")
    
    try:
        # Query mountain information
        query = f"SELECT {_MOUNTAINS_SELECT_FIELDS} FROM mountains WHERE mountain_name ILIKE %s"
        params = [f"%{mountain_name}%"]
        
        query += " LIMIT 1;"
        
        print(f"Executing query: {query}")
        print(f"Query parameters: {params}")
        
        mountain_results = _execute_query(query, params)
        
        if not mountain_results:
            result_text = f"No mountain found matching the criteria."
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=result_text)],
                structuredContent={"mountain": None, "route_count": 0},
            )
        
        # Get mountain data
        mountain_row = mountain_results[0]
        mountain_data = _mountains_row_to_dict(mountain_row)
        mountain_name_for_routes = mountain_data["name"]
        
        # Query route count for this mountain
        route_count_query = "SELECT COUNT(*) FROM routes WHERE mountain_name = %s"
        route_count_results = _execute_query(route_count_query, [mountain_name_for_routes])
        route_count = route_count_results[0][0] if route_count_results else 0
        
        # Build result text
        result_text = f"Mountain: {mountain_data['name']}\n"
        if mountain_data.get('elevation'):
            result_text += f"Elevation: {mountain_data['elevation_ft']}\n"
        if mountain_data.get('rank') is not None:
            result_text += f"Rank: {mountain_data['rank']}\n"
        if mountain_data.get('county'):
            result_text += f"County: {mountain_data['county']}\n"
        if mountain_data.get('nearby_towns'):
            result_text += f"Nearby Towns: {mountain_data['nearby_towns']}\n"
        result_text += f"Number of Routes: {route_count}\n"
        
        # Prepare structured content for widget
        widget_data = {
            "mountain": mountain_data,
            "route_count": route_count,
        }
        
        # Get the mountain info widget
        mountain_info_widget = WIDGETS_BY_ID.get("mountain-info")
        meta = _tool_invocation_meta(mountain_info_widget) if mountain_info_widget else {}
        
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=result_text)],
            structuredContent=widget_data,
            _meta=meta,
        )
        
    except Exception as e:
        error_msg = f"Failed to get mountain information: {e}"
        print(error_msg)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=error_msg)],
            isError=True,
        )


async def _get_weather(arguments: Dict) -> types.CallToolResult:
    """Get weather information from the National Weather Service API using a mountain name."""
    
    # Arguments already validated by Pydantic (mountain_name is required)
    mountain_name = arguments.get("mountain_name")
    
    try:
        # Query the database to get the mountain's coordinates
        query = f"SELECT {_MOUNTAINS_SELECT_FIELDS} FROM mountains WHERE mountain_name ILIKE %s LIMIT 1;"
        params = [f"%{mountain_name}%"]
        
        print(f"Executing query: {query}")
        print(f"Query parameters: {params}")
        
        mountain_results = _execute_query(query, params)
        
        if not mountain_results:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Error: No mountain found matching '{mountain_name}'. Please check the mountain name and try again.")],
                isError=True,
            )
        
        # Extract mountain data
        mountain_row = mountain_results[0]
        mountain_data = _mountains_row_to_dict(mountain_row)
        
        # Get coordinates
        lat = mountain_data.get("latitude")
        lon = mountain_data.get("longitude")
        actual_mountain_name = mountain_data.get("name")
        
        if lat is None or lon is None:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Error: Mountain '{actual_mountain_name}' does not have GPS coordinates in the database.")],
                isError=True,
            )
        
        # Validate coordinates
        try:
            lat = float(lat)
            lon = float(lon)
        except (ValueError, TypeError):
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Error: Invalid coordinates for mountain '{actual_mountain_name}'.")],
                isError=True,
            )
        
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"Error: Invalid coordinates for mountain '{actual_mountain_name}'.")],
                isError=True,
            )
        
        # First, get the grid endpoint
        points_url = f"https://api.weather.gov/points/{lat},{lon}"
        
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            try:
                points_response = await client.get(points_url, headers=NWS_HEADERS)
                points_response.raise_for_status()
                points_data = points_response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    return types.CallToolResult(
                        content=[types.TextContent(type="text", text=f"Error: No weather data available for {actual_mountain_name} at coordinates ({lat}, {lon}). The location may be outside the NWS coverage area.")],
                        isError=True,
                    )
                return types.CallToolResult(
                    content=[types.TextContent(type="text", text=f"Error: Failed to get weather grid point: HTTP {e.response.status_code}")],
                    isError=True,
                )
            except httpx.RequestError as e:
                return types.CallToolResult(
                    content=[types.TextContent(type="text", text=f"Error: Network error connecting to NWS API: {str(e)}")],
                    isError=True,
                )
            
            # Get the forecast URL from the points data
            try:
                forecast_url = points_data['properties']['forecast']
            except KeyError:
                return types.CallToolResult(
                    content=[types.TextContent(type="text", text="Error: Invalid response from NWS API - forecast URL not found.")],
                    isError=True,
                )
            
            # Get the forecast data
            try:
                forecast_response = await client.get(forecast_url, headers=NWS_HEADERS)
                forecast_response.raise_for_status()
                forecast_data = forecast_response.json()
            except httpx.HTTPStatusError as e:
                return types.CallToolResult(
                    content=[types.TextContent(type="text", text=f"Error: Failed to get weather forecast: HTTP {e.response.status_code}")],
                    isError=True,
                )
            except httpx.RequestError as e:
                return types.CallToolResult(
                    content=[types.TextContent(type="text", text=f"Error: Network error getting forecast: {str(e)}")],
                    isError=True,
                )
        
        # Process the forecast data
        try:
            periods = forecast_data['properties']['periods']
        except KeyError:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text="Error: Invalid forecast response - periods not found.")],
                isError=True,
            )
        
        if not periods:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"No forecast periods available for {actual_mountain_name}.")],
                structuredContent={
                    "weather": {
                        "mountain_name": actual_mountain_name,
                        "location": {"latitude": lat, "longitude": lon},
                        "current_conditions": {},
                        "forecast": []
                    }
                },
            )
        
        # Get current conditions from the first period
        weather_data = {
            'mountain_name': actual_mountain_name,
            'location': {
                'latitude': lat,
                'longitude': lon,
            },
            'current_conditions': {},
            'forecast': []
        }
        
        if periods:
            current = periods[0]
            weather_data['current_conditions'] = {
                'temperature': current.get('temperature'),
                'temperatureUnit': current.get('temperatureUnit'),
                'wind_speed': current.get('windSpeed'),
                'wind_direction': current.get('windDirection'),
                'short_forecast': current.get('shortForecast'),
                'detailed_forecast': current.get('detailedForecast')
            }
        
        # Get forecast for next few days
        for period in periods[1:FORECAST_PERIODS + 1]:  # Get next periods
            weather_data['forecast'].append({
                'name': period.get('name'),
                'temperature': period.get('temperature'),
                'temperatureUnit': period.get('temperatureUnit'),
                'wind_speed': period.get('windSpeed'),
                'wind_direction': period.get('windDirection'),
                'short_forecast': period.get('shortForecast'),
                'detailed_forecast': period.get('detailedForecast')
            })
        
        # Format the result text
        result_text = f"Weather forecast for {actual_mountain_name} ({lat}, {lon}):\n\n"
        
        # Add current conditions
        if weather_data['current_conditions']:
            current = weather_data['current_conditions']
            result_text += "Current Conditions:\n"
            if current.get('temperature') is not None:
                temp_unit = current.get('temperatureUnit', 'F')
                result_text += f"  Temperature: {current['temperature']}°{temp_unit}\n"
            if current.get('wind_speed'):
                wind = current['wind_speed']
                if current.get('wind_direction'):
                    wind += f" {current['wind_direction']}"
                result_text += f"  Wind: {wind}\n"
            if current.get('short_forecast'):
                result_text += f"  Conditions: {current['short_forecast']}\n"
            if current.get('detailed_forecast'):
                result_text += f"  {current['detailed_forecast']}\n"
            result_text += "\n"
        
        # Add forecast
        if weather_data['forecast']:
            result_text += "Forecast:\n"
            for period in weather_data['forecast']:
                result_text += f"{period['name']}:\n"
                if period.get('temperature') is not None:
                    temp_unit = period.get('temperatureUnit', 'F')
                    result_text += f"  Temperature: {period['temperature']}°{temp_unit}\n"
                if period.get('wind_speed'):
                    wind = period['wind_speed']
                    if period.get('wind_direction'):
                        wind += f" {period['wind_direction']}"
                    result_text += f"  Wind: {wind}\n"
                if period.get('short_forecast'):
                    result_text += f"  Conditions: {period['short_forecast']}\n"
                if period.get('detailed_forecast'):
                    result_text += f"  {period['detailed_forecast']}\n"
                result_text += "\n"
        
        # Add presentation format instructions to structured content
        structured_content = {
            "weather": weather_data,
            "formatting_instructions": "Use a table for multi-day forecasts. Use emojis to represent weather conditions (☀️ sunny, ⛅ partly sunny, ☁️ cloudy, 💨 windy, 🌫️ foggy, 🌧️ rain, ❄️ snow, ⛈️ storms). Provide advice on the best day to go based on weather conditions."
        }
        
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=result_text)],
            structuredContent=structured_content,
        )
        
    except Exception as e:
        error_msg = f"Failed to get weather: {e}"
        print(error_msg)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=error_msg)],
            isError=True,
        )


# Tool registry - maps tool names to their execution handlers and input models
TOOL_HANDLERS: Dict[str, Callable[[Dict], Awaitable[types.CallToolResult]]] = {
    "get_mountains": _query_mountains,
    "get_routes": _query_routes,
    "get_mountain_info": _get_mountain_info,
    "get_weather": _get_weather,
}

# Pydantic models for each tool
TOOL_INPUT_MODELS: Dict[str, type[BaseModel]] = {
    "get_mountains": MountainsInput,
    "get_routes": RoutesInput,
    "get_mountain_info": MountainInfoInput,
    "get_weather": WeatherInput,
}




@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    return [
        types.Tool(
            name="get_mountains",
            title="Get Mountains",
            description="Search and filter Colorado 14er mountains. Returns mountain details including name, elevation, rank, range, county, location, and nearby towns. Results are displayed in an interactive map widget. Use this when users ask about mountains, peaks, hiking, elevation, or geographic information. Presentation format: use a table when presenting multiple mountains. After showing results, suggest: checking details for a specific mountain, finding routes, or checking weather.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 10, max: 1000).",
                        "minimum": 1,
                        "maximum": 1000,
                    },
                    "min_elevation": {
                        "type": "integer",
                        "description": "Minimum elevation in feet. Example: 14000 for 14ers. Can combine with max_elevation.",
                    },
                    "max_elevation": {
                        "type": "integer",
                        "description": "Maximum elevation in feet. Can combine with min_elevation.",
                    },
                    "rank_filter": {
                        "type": "string",
                        "description": "Rank filter. CRITICAL: Default excludes unranked mountains. Values: 'include_all' (all mountains), 'only_unranked', 'exclude_unranked' (default), or rank number like '1', '2'. Use 'include_all' for comprehensive results.",
                        "examples": ["include_all", "only_unranked", "exclude_unranked", "1", "2"],
                    },
                    "name_search": {
                        "type": "string",
                        "description": "Mountain name filter. Case-insensitive partial matching. IMPORTANT: Use 'Mt.' not 'Mount' (e.g., 'Mt. Elbert' not 'Mount Elbert'). Examples: 'Longs' matches 'Longs Peak', 'Elbert' matches 'Mt. Elbert'.",
                    },
                    "mountain_range": {
                        "type": "string",
                        "description": "Mountain range filter. Case-insensitive partial matching. IMPORTANT: Omit 'Range' (e.g., use 'Front' not 'Front Range'). Examples: 'Front' matches 'Front Range', 'Sawatch' matches 'Sawatch Range'.",
                    },
                    "county": {
                        "type": "string",
                        "description": "County filter. Case-insensitive partial matching. Examples: 'Clear Creek' matches 'Clear Creek County', 'Larimer' matches 'Larimer County'.",
                    },
                    "nearby_towns": {
                        "type": "string",
                        "description": "Nearby towns filter. Case-insensitive partial matching. Examples: 'Denver' matches mountains near Denver, 'Aspen' matches mountains near Aspen.",
                    },
                    "order_by": {
                        "type": "string",
                        "description": "Sort field: 'elevation' (default) or 'rank'.",
                        "enum": ["elevation", "rank"],
                    },
                    "order_direction": {
                        "type": "string",
                        "description": "Sort direction: 'DESC' (default, highest first) or 'ASC' (lowest first).",
                        "enum": ["ASC", "DESC"],
                    },
                },
                "additionalProperties": False,
            },
            _meta=_tool_meta(widget),
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get_routes",
            title="Get Routes",
            description="Get climbing routes for Colorado 14ers. Returns route details including difficulty, distance, elevation gain, risk factors, and snow/standard status. Use this when users ask about routes, trails, or route planning. Presentation format: use a table when presenting multiple routes, provide personalized recommendations based on user preferences (experience level, distance, difficulty). After showing routes, suggest checking weather if not already done.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of route records to return. Defaults to 10 if not specified. Maximum allowed value is 1000. Use this to control result set size.",
                        "minimum": 1,
                        "maximum": 1000,
                    },
                    "mountain_name": {
                        "type": "string",
                        "description": "Mountain name filter. Case-insensitive partial matching. IMPORTANT: Use 'Mt.' not 'Mount' (e.g., 'Mt. Elbert' not 'Mount Elbert'). Examples: 'Elbert' matches 'Mt. Elbert', 'Longs' matches 'Longs Peak'.",
                    },
                    "route_name": {
                        "type": "string",
                        "description": "Route name filter. Case-insensitive partial matching. Example: 'North' matches routes with 'North' in the name.",
                    },
                    "route_difficulty": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Difficult Class 2", "Easy Class 3"],
                        },
                        "description": "Filter routes by difficulty class(es). Can select multiple values. Omit to include all difficulty classes.",
                    },
                    "range": {
                        "type": "string",
                        "description": "Mountain range filter. Case-insensitive partial matching. IMPORTANT: Omit 'Range' (e.g., use 'Front' not 'Front Range'). Examples: 'Front' matches 'Front Range', 'Sawatch' matches 'Sawatch Range'.",
                    },
                    "snow": {
                        "type": "boolean",
                        "description": "Filter routes by snow route status. Set to true to return only snow routes, false to return only non-snow routes. Omit to include both.",
                    },
                    "standard": {
                        "type": "boolean",
                        "description": "Filter routes by standard route status. Set to true to return only standard routes, false to return only non-standard routes. Omit to include both.",
                    },
                    "min_distance": {
                        "type": "number",
                        "description": "Filter to return only routes with roundtrip distance greater than or equal to this value (in miles). Omit to include all distances. Can be combined with max_distance to create a distance range.",
                    },
                    "max_distance": {
                        "type": "number",
                        "description": "Filter to return only routes with roundtrip distance less than or equal to this value (in miles). Omit to include all distances. Can be combined with min_distance to create a distance range.",
                    },
                    "min_elevation_gain": {
                        "type": "integer",
                        "description": "Filter to return only routes with elevation gain greater than or equal to this value (in feet). Omit to include all elevation gains. Can be combined with max_elevation_gain to create an elevation gain range.",
                    },
                    "max_elevation_gain": {
                        "type": "integer",
                        "description": "Filter to return only routes with elevation gain less than or equal to this value (in feet). Omit to include all elevation gains. Can be combined with min_elevation_gain to create an elevation gain range.",
                    },
                    "order_by": {
                        "type": "string",
                        "description": "Specifies which field to use for sorting the results. Valid values: 'mountain_name' (sorts alphabetically by mountain, default), 'roundtrip_distance' (sorts by distance in miles), 'elevation_gain' (sorts by elevation gain in feet), 'route_difficulty' (sorts by difficulty class). Defaults to 'mountain_name' if not specified or if an invalid value is provided.",
                        "enum": ["roundtrip_distance", "elevation_gain", "route_difficulty", "mountain_name"],
                    },
                    "order_direction": {
                        "type": "string",
                        "description": "Specifies the sort direction. Valid values: 'ASC' (ascending, default) or 'DESC' (descending). Defaults to 'ASC' if not specified or if an invalid value is provided. Use 'ASC' to see shortest distances/lowest elevation gains first, or 'DESC' to see longest distances/highest elevation gains first.",
                        "enum": ["ASC", "DESC"],
                    },
                },
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get_mountain_info",
            title="Get Mountain Information",
            description="Get detailed information about a specific Colorado 14er mountain. Returns name, elevation, rank, county, nearby towns, and route count. Results are displayed in a visual widget. Use this when users ask about a specific mountain. After getting mountain info, suggest checking routes or weather.",
            inputSchema={
                "type": "object",
                "properties": {
                    "mountain_name": {
                        "type": "string",
                        "description": "Mountain name to look up. Case-insensitive partial matching supported. IMPORTANT: Use 'Mt.' not 'Mount' (e.g., 'Mt. Elbert' not 'Mount Elbert'). Examples: 'Elbert' matches 'Mt. Elbert', 'Longs' matches 'Longs Peak'.",
                    },
                },
                "required": ["mountain_name"],
                "additionalProperties": False,
            },
            _meta=_tool_meta(mountain_info_widget),
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
        types.Tool(
            name="get_weather",
            title="Get Weather",
            description="Get weather forecast for a specific Colorado 14er mountain. Returns current conditions and multi-day forecast with temperature, wind speed/direction, and detailed descriptions. The forecast includes multiple periods (typically day/night cycles). Presentation format: use a table for multi-day forecasts, emojis for weather conditions (☀️ sunny, ⛅ partly sunny, ☁️ cloudy, 💨 windy, 🌫️ foggy, 🌧️ rain, ❄️ snow, ⛈️ storms), and provide advice on the best day to go based on weather conditions.",
            inputSchema={
                "type": "object",
                "properties": {
                    "mountain_name": {
                        "type": "string",
                        "description": "The name of the mountain to get weather for. Case-insensitive partial matching is supported. IMPORTANT: For mountains named 'Mount Something', use 'Mt.' instead of 'Mount' (e.g., use 'Mt. Elbert' not 'Mount Elbert'). Examples: 'Elbert' will match 'Mt. Elbert', 'Longs' will match 'Longs Peak'.",
                    },
                },
                "required": ["mountain_name"],
                "additionalProperties": False,
            },
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        ),
    ]


async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    """Main tool request handler - delegates to specific tool handlers."""
    tool_name = req.params.name
    arguments = req.params.arguments or {}
    
    # Look up the tool handler
    handler = TOOL_HANDLERS.get(tool_name)
    if handler is None:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Unknown tool: {tool_name}",
                    )
                ],
                isError=True,
            )
        )
    
    # Validate input using Pydantic if a model exists for this tool
    input_model = TOOL_INPUT_MODELS.get(tool_name)
    if input_model:
        try:
            validated_input = input_model.model_validate(arguments)
            # Convert validated model back to dict for handler compatibility
            arguments = validated_input.model_dump(exclude_none=False)
        except ValidationError as exc:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=f"Input validation error: {exc.errors()}",
                        )
                    ],
                    isError=True,
                )
            )
    
    # Execute the tool handler
    try:
        result = await handler(arguments)
        return types.ServerResult(result)
    except Exception as exc:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Error executing tool: {str(exc)}",
                    )
                ],
                isError=True,
            )
        )


@mcp._mcp_server.list_resources()
async def _list_resources() -> List[types.Resource]:
    """List available UI resources."""
    return [
        types.Resource(
            name=widget.title,
            title=widget.title,
            uri=widget.template_uri,
            description=_resource_description(widget),
            mimeType=MIME_TYPE,
            _meta=_tool_meta(widget),
        ),
        types.Resource(
            name=mountain_info_widget.title,
            title=mountain_info_widget.title,
            uri=mountain_info_widget.template_uri,
            description=_resource_description(mountain_info_widget),
            mimeType=MIME_TYPE,
            _meta=_tool_meta(mountain_info_widget),
        ),
    ]


@mcp._mcp_server.list_resource_templates()
async def _list_resource_templates() -> List[types.ResourceTemplate]:
    """List available UI resource templates."""
    return [
        types.ResourceTemplate(
            name=widget.title,
            title=widget.title,
            uriTemplate=widget.template_uri,
            description=_resource_description(widget),
            mimeType=MIME_TYPE,
            _meta=_tool_meta(widget),
        ),
        types.ResourceTemplate(
            name=mountain_info_widget.title,
            title=mountain_info_widget.title,
            uriTemplate=mountain_info_widget.template_uri,
            description=_resource_description(mountain_info_widget),
            mimeType=MIME_TYPE,
            _meta=_tool_meta(mountain_info_widget),
        ),
    ]


async def _handle_read_resource(req: types.ReadResourceRequest) -> types.ServerResult:
    """Handle resource read requests for UI templates."""
    uri = str(req.params.uri)
    
    # Handle widget resources
    widget_instance = WIDGETS_BY_URI.get(uri)
    if widget_instance is None:
        return types.ServerResult(
            types.ReadResourceResult(
                contents=[],
                _meta={"error": f"Unknown resource: {uri}"},
            )
        )

    # Reload HTML from disk to pick up changes during development
    # Clear the cache to ensure fresh content
    _load_widget_html.cache_clear()
    
    # Determine which widget HTML to load based on the widget identifier
    widget_name = widget_instance.identifier.replace("-", "_")
    if widget_instance.identifier == "mountains-map":
        widget_name = "mountains"
    elif widget_instance.identifier == "mountain-info":
        widget_name = "mountain-info"
    
    fresh_html = _load_widget_html(widget_name)

    contents = [
        types.TextResourceContents(
            uri=widget_instance.template_uri,
            mimeType=MIME_TYPE,
            text=fresh_html,
            _meta=_tool_meta(widget_instance),
        )
    ]

    return types.ServerResult(types.ReadResourceResult(contents=contents))


mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request
mcp._mcp_server.request_handlers[types.ReadResourceRequest] = _handle_read_resource

# Create the MCP app
# Note: Static assets (JS/CSS) are served from Supabase Storage in production
# or from a separate server (pnpm run serve) for local development
app = mcp.streamable_http_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
    )