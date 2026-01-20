# High-Speed Ingestor Dashboard

A premium, Discord-inspired real-time monitoring dashboard built with Next.js 14, Framer Motion, and Recharts.

## Features

### Visual Design
- **Discord's Blurple Color Palette**: Authentic Discord colors (#5865F2)
- **Glassmorphism Effects**: Semi-transparent cards with blur and 1px blurple borders
- **Dark Mode First**: Premium dark theme matching Discord's aesthetic
- **Radial Gradient Background**: Subtle blurple accents

### Animations (Framer Motion)
- **Smooth Layout Transitions**: Cards and components shift smoothly when data updates
- **Slide-in Messages**: New messages fade and slide in from the top
- **Pulsing Health Indicators**: Live pulse animations for system status
- **Interactive Hover Effects**: Scale, rotate, and glow effects
- **Staggered Entrance**: Sequential loading with delays for visual polish

### Components

#### 1. StatCard (Glassmorphism)
- Semi-transparent background with backdrop blur
- Animated gradient borders
- Hover scale effects and glow
- Trend indicators with arrows
- Icon animations on hover

#### 2. HealthMonitor (Pulse Animations)
- Pulsing rings for healthy services
- Real-time service status grid
- Color-coded status indicators (green/yellow/red)
- Animated status dots

#### 3. ThroughputGauge (Recharts)
- Animated circular progress gauge
- Live area chart with gradient fill
- Real-time data visualization
- Peak/Average/Current stats footer

#### 4. LiveFeed (Slide Animations)
- Messages slide in from top with fade
- AnimatePresence for smooth entry/exit
- Hover effects on message cards
- Live indicator with pulse animation

#### 5. Sidebar Navigation
- Fixed glassmorphism sidebar
- Animated nav items with active indicator
- Smooth transitions and hover effects

## Installation

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx           # Root layout with Inter font
│   ├── page.tsx             # Main dashboard page
│   └── globals.css          # Tailwind + custom styles
├── components/
│   ├── StatCard.tsx         # Glassmorphism stat card
│   ├── HealthMonitor.tsx    # Pulsing health indicators
│   ├── ThroughputGauge.tsx  # Animated gauge + chart
│   └── LiveFeed.tsx         # Slide-in message feed
├── hooks/
│   └── useMessages.ts       # Polling hook for real-time data
├── lib/
│   ├── api.ts               # API client + mock data
│   └── types.ts             # TypeScript interfaces
├── package.json
├── tailwind.config.ts       # Custom Discord theme
├── tsconfig.json
└── .env.local              # Environment variables
```

## Configuration

### Environment Variables

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000

# Polling interval (ms)
NEXT_PUBLIC_POLL_INTERVAL=2000
```

### Theme Colors (Tailwind)

```typescript
blurple: {
  500: '#5865F2', // Main Discord Blurple
  400: '#7d85ff',
  600: '#4752c4',
}

discord: {
  darker: '#1e1f22',  // Background
  dark: '#2b2d31',    // Cards
  medium: '#313338',  // Elevated
  light: '#383a40',   // Borders
  text: '#dbdee1',    // Primary text
  muted: '#949ba4',   // Secondary text
}
```

### Custom CSS Classes

```css
.glass-card              /* Light glassmorphism */
.glass-card-strong       /* Strong glassmorphism */
.btn-blurple            /* Gradient button */
.pulse-ring             /* Pulsing animation */
.shimmer                /* Loading shimmer */
```

## Key Features Breakdown

### 1. Glassmorphism Effect

All cards use:
- `backdrop-blur-md` or `backdrop-blur-xl`
- Semi-transparent backgrounds (40-60% opacity)
- 1px border with `border-blurple-500/20` or `/30`
- Gradient background overlays
- Shadow effects

### 2. Framer Motion Layout

Components use `layout` prop for automatic animations:
```tsx
<motion.div layout>
  {/* Content shifts smoothly when data changes */}
</motion.div>
```

### 3. Slide-in Messages

```tsx
<motion.div
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, x: -100 }}
>
```

### 4. Pulse Animations

```tsx
<motion.div
  animate={{ scale: [1, 1.2, 1] }}
  transition={{ duration: 2, repeat: Infinity }}
/>
```

### 5. Recharts Integration

- Area chart with gradient fills
- Custom tooltip styling
- Smooth animations with 300ms duration
- Discord-themed colors

## Animation Timing

- **Initial Load**: 500ms fade-in
- **Staggered Cards**: 100ms delay between each
- **Layout Shifts**: 300ms smooth transition
- **Hover Effects**: 200ms duration
- **Pulse Animations**: 2-3s infinite loop

## Responsive Design

- **Desktop First**: Optimized for large screens
- **Grid System**: Responsive grid with `md:` and `lg:` breakpoints
- **Sidebar**: Fixed 80px width on desktop
- **Mobile**: Can be enhanced with mobile-specific layouts

## Performance

- **Polling**: 2-second intervals (configurable)
- **Memoization**: Components use React best practices
- **Lazy Loading**: Next.js automatic code splitting
- **Smooth 60fps**: Framer Motion hardware-accelerated animations

## Mock Data

The dashboard includes mock data generators for development when the backend isn't available:
- Random messages
- Simulated throughput
- Fake statistics

Replace with real API calls once backend endpoints are ready.

## Next Steps

### Backend Integration

Add these endpoints to your FastAPI backend:

```python
# Get recent messages
@app.get("/messages")
async def get_messages(limit: int = 50):
    # Return last N messages from PostgreSQL
    pass

# Get statistics
@app.get("/stats")
async def get_stats():
    return {
        "total_messages": 1234,
        "queue_depth": 12,
        "messages_per_second": 45,
        "total_batches": 25,
        "avg_batch_size": 49.3
    }
```

### Future Enhancements

- [ ] WebSocket support for true real-time updates
- [ ] Interactive message filtering
- [ ] Time range selector for charts
- [ ] Export data functionality
- [ ] User settings panel
- [ ] Mobile responsive layout
- [ ] Dark/Light theme toggle
- [ ] Custom alerts and notifications

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion 11
- **Charts**: Recharts 2
- **Icons**: Lucide React
- **Fonts**: Inter (Google Fonts)

## Build for Production

```bash
# Build optimized production bundle
npm run build

# Start production server
npm start
```

## Credits

Inspired by:
- Discord's interface design
- Modern glassmorphism trends
- High-performance monitoring tools (Grafana, Datadog)

---

Built with ❤️ using Next.js and Framer Motion
