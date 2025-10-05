# Redditto - Reddit Clone

A fully functional Reddit clone with a modern, responsive design. Built with vanilla HTML, CSS, and JavaScript.

## Features

### 🎨 User Interface
- **Clean, modern design** inspired by Reddit's interface
- **Fully responsive** - works on desktop, tablet, and mobile devices
- **Smooth animations** and hover effects
- **Dark accents** with Reddit's signature orange color scheme

### 📝 Post Management
- **View posts** with images, text, and metadata
- **Create new posts** with a modal interface
- **Vote system** (upvote/downvote) with visual feedback
- **Post images** - sample posts include beautiful generated images
- **Community avatars** using DiceBear API

### 🔍 Navigation & Discovery
- **Search functionality** - search posts by title, content, community, or author
- **Sort options** - Hot, New, and Top
- **Community sidebar** - quick access to favorite communities
- **Trending section** - see what's popular today

### ⚡ Interactive Features
- **Real-time vote counting** with formatted numbers (e.g., 12.8k)
- **Keyboard shortcuts**:
  - Press `c` to create a new post
  - Press `Escape` to close modals
- **Click outside modal** to close
- **Hover effects** on all interactive elements

### 📱 Responsive Design
- **Mobile-first** approach
- **Adaptive layout** that changes based on screen size:
  - Mobile: Single column feed
  - Tablet: Feed with left sidebar
  - Desktop: Full three-column layout

## Sample Posts

The app comes with 7 pre-loaded example posts including:
1. **Photography** - Mountain sunset with generated landscape image
2. **Battlestations** - Minimalist workspace setup
3. **Programming** - Code refactoring success story with code editor image
4. **Aww** - Cute puppy post with adorable dog image
5. **Cyberpunk** - Futuristic cityscape at night
6. **Technology** - Quantum computing breakthrough (text only)
7. **Web Development** - CSS Grid vs Flexbox guide (text only)

## File Structure

```
├── index.html          # Main HTML structure
├── styles.css          # All styling and responsive design
├── script.js           # JavaScript functionality
├── images/             # Generated post images
│   ├── post1.jpg       # Sunset landscape
│   ├── post2.jpg       # Workspace setup
│   ├── post3.jpg       # Code editor
│   ├── post4.jpg       # Puppy
│   └── post5.jpg       # Cyberpunk city
└── README.md           # This file
```

## How to Use

1. **Open** `index.html` in a web browser
2. **Browse** through the example posts
3. **Vote** on posts by clicking the up/down arrows
4. **Search** for content using the search bar
5. **Create** a new post by clicking "Create Post" or pressing `c`
6. **Sort** posts using the Hot/New/Top buttons

## Creating a New Post

1. Click the "Create Post" button in the header (or press `c`)
2. Select a community from the dropdown
3. Enter a title (required)
4. Optionally add text content
5. Optionally add an image URL
6. Click "Post" to publish

## Customization

### Colors
Edit the CSS variables in `styles.css`:
```css
:root {
    --primary-color: #FF4500;
    --primary-hover: #FF5722;
    --background: #DAE0E6;
    --card-bg: #FFFFFF;
    --text-primary: #1c1c1c;
    --text-secondary: #7c7c7c;
}
```

### Add More Communities
Edit the `initialPosts` array in `script.js` to add posts from new communities.

### Add More Sample Posts
Extend the `initialPosts` array in `script.js` with new post objects:
```javascript
{
    id: 8,
    community: 'yourcommunity',
    communityName: 'r/yourcommunity',
    author: 'username',
    timestamp: '1 hour ago',
    title: 'Your post title',
    text: 'Your post content',
    image: 'path/to/image.jpg',
    votes: 100,
    comments: 10,
    userVote: 0
}
```

## Technologies Used

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with Grid and Flexbox
- **JavaScript (ES6+)** - Vanilla JS, no frameworks
- **SVG Icons** - Custom inline SVG icons
- **DiceBear API** - Dynamic avatar generation

## Browser Support

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

## Future Enhancements

Potential features to add:
- Comments section
- User profiles
- Dark mode toggle
- Post filtering by community
- Save/share functionality
- Awards system
- Markdown support in posts
- Image upload instead of URLs
- Backend integration (database, authentication)

## License

Free to use and modify for personal or commercial projects.

---

**Enjoy using Redditto!** 🚀
