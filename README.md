# Colorado 14ers MCP Server

An intelligent MCP server that provides comprehensive information about Colorado's 14,000+ foot peaks (14ers) through ChatGPT Apps. Built with React, TypeScript, and Python, this server offers interactive widgets and powerful search capabilities to help hikers explore and plan their mountain adventures.

## What It Does

The Colorado 14ers MCP Server is a specialized tool that connects ChatGPT to a rich database of Colorado mountain information. It enables natural language queries about mountains, routes, weather, and planning, with results displayed through beautiful, interactive visual widgets directly in the ChatGPT interface.

## Features

### 🗻 Mountain Search & Discovery

**Get Mountains** - Search and filter Colorado 14ers with powerful query capabilities:
- **Elevation filtering**: Find mountains by elevation range (e.g., all peaks above 14,000ft)
- **Geographic filtering**: Filter by mountain range (Elk, Front, Mosquito, San Juan, Sangre de Cristo, Sawatch, Tenmile), county, or nearby towns
- **Name search**: Case-insensitive partial matching (e.g., "Elbert" matches "Mt. Elbert")
- **Rank filtering**: Include or exclude unranked peaks, or search by specific rank
- **Flexible sorting**: Sort by elevation or rank, ascending or descending
- **Interactive map widget**: Results are displayed on an interactive Leaflet map showing all matching peaks with clickable markers and a results panel

### 📍 Detailed Mountain Information

**Get Mountain Information** - Get comprehensive details about any specific 14er:
- Complete mountain profile including elevation, rank, range, county, and nearby towns
- Geographic coordinates for navigation
- Mountain images and links to external resources
- Route count for the mountain
- **Visual widget**: Beautiful card-based display with mountain photo, key statistics, and quick access to routes and weather

### 🛤️ Route Planning & Analysis

**Get Routes** - Find climbing routes with detailed specifications:
- **Difficulty filtering**: Filter by class (Class 1-5, Difficult Class 2, Easy Class 3)
- **Distance & elevation**: Filter by roundtrip distance and elevation gain ranges
- **Route characteristics**: Filter by standard routes, snow routes, or both
- **Risk assessment**: View risk factors including exposure, rockfall, route finding, and commitment levels
- **Mountain & range filtering**: Find routes for specific mountains or ranges
- **Flexible sorting**: Sort by mountain name, distance, elevation gain, or difficulty
- Personalized recommendations based on experience level and preferences

### 🌤️ Weather Intelligence

**Get Weather** - Real-time weather forecasts for any 14er:
- Current conditions and multi-day forecasts
- Temperature, wind speed, and wind direction
- Detailed weather descriptions with visual indicators
- Best day recommendations based on weather conditions
- Weather emoji indicators (☀️ sunny, ⛅ partly sunny, ☁️ cloudy, 💨 windy, 🌫️ foggy, 🌧️ rain, ❄️ snow, ⛈️ storms)

## Interactive Widgets

### Mountains Map Widget
An interactive Leaflet map that displays search results with:
- Clickable markers for each mountain
- Automatic bounds fitting to show all results
- Results panel with mountain details
- Smooth marker selection and highlighting
- Fully responsive design optimized for both desktop and mobile devices
- Compact mobile layout with scrollable results panel

### Mountain Info Widget
A beautiful card-based display featuring:
- High-quality mountain photography
- Key statistics (elevation, rank, range, county)
- Geographic information and nearby towns
- Quick access links to routes and weather
- Responsive grid layout (side-by-side on desktop, stacked on mobile)
- Optimized mobile layout with fixed image height and scrollable content

### Routes Widget
An interactive list widget displaying route information:
- Detailed route cards with difficulty badges
- Risk factor indicators (exposure, rockfall, route finding, commitment)
- Distance and elevation gain metrics
- Standard route and snow route indicators
- Fully responsive design with compact mobile layout
- Personalized route recommendations based on experience level

### Weather Widget
An interactive carousel widget for weather forecasts:
- Current conditions and multi-day forecasts
- Visual weather icons and emoji indicators
- Temperature, wind, and precipitation data
- Horizontal scrolling carousel interface
- Fully responsive design with optimized card sizes for mobile
- "Recommendation of the Day" feature for best climbing conditions

## Technical Architecture

- **Backend**: Python FastMCP server with PostgreSQL database
- **Frontend**: React + TypeScript widgets built with Vite
- **UI Components**: OpenAI Apps SDK UI components
- **Styling**: Tailwind CSS with mobile-first responsive design
- **Mapping**: Leaflet.js for interactive maps
- **Carousel**: Embla Carousel for weather forecast navigation
- **Deployment**: Supabase Storage for static assets, Alpic for MCP server hosting
- **Build System**: Automated build and deployment pipeline with version hashing

## Data Sources

The server connects to a comprehensive PostgreSQL database containing:
- Complete 14er mountain data (names, elevations, ranks, locations)
- Detailed route information with difficulty ratings
- Geographic data (ranges, counties, coordinates, nearby towns)
- Mountain images and external resource links
- Real-time weather data integration

## Use Cases

- **Trip Planning**: "Show me all 14ers near Denver with routes under 10 miles"
- **Route Discovery**: "Find Class 2 routes in the Sawatch Range with low rockfall risk"
- **Weather Checking**: "What's the weather forecast for Mt. Elbert this weekend?"
- **Mountain Research**: "Tell me about Longs Peak and show me its routes"
- **Adventure Planning**: "Find the easiest routes for beginners in the Front Range"

## Mobile Responsiveness

All widgets are fully optimized for mobile devices:
- **Compact layouts**: Reduced padding, smaller icons, and optimized spacing on mobile screens
- **Scrollable content**: Content sections are scrollable when needed, ensuring all information is accessible
- **Touch-friendly**: Larger touch targets and optimized button sizes for mobile interaction
- **Adaptive sizing**: Text, images, and UI elements automatically adjust for smaller screens
- **Fixed heights**: Widgets maintain consistent heights while content adapts to screen size

## Smart Response Formatting

The server is optimized to provide concise, value-added responses that complement the visual widgets:
- **Brief insights**: LLM responses focus on recommendations and insights rather than repeating widget data
- **Personalized recommendations**: Route suggestions based on user experience level (beginner, intermediate, advanced)
- **Weather recommendations**: Clear "Recommendation of the Day" identifying the best climbing conditions
- **Actionable advice**: Practical guidance for planning climbs based on conditions and route difficulty

## Integration

This MCP server is designed to work seamlessly with ChatGPT Apps, providing natural language access to Colorado 14ers data. Users can ask questions in plain English, and the server intelligently routes queries to the appropriate tools, returning both concise text responses with actionable insights and interactive visual widgets.
