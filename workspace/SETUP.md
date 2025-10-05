# Setup Guide - Burger House Website

## Quick Start

1. **Download all files** to a folder on your computer
2. **Open `index.html`** in your web browser
3. That's it! The website is ready to view.

## Files Included

- `index.html` - Main website file
- `styles.css` - All styling and design
- `script.js` - Interactive features
- `README.md` - Full documentation
- `SETUP.md` - This file
- **Images folder** with 9 burger images

## Viewing the Website

### Option 1: Direct Open (Simplest)
- Double-click `index.html`
- Opens in your default browser

### Option 2: Local Server (Recommended for Development)

**Using Python:**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```
Then visit: `http://localhost:8000`

**Using Node.js (with http-server):**
```bash
npx http-server
```

**Using VS Code:**
- Install "Live Server" extension
- Right-click `index.html`
- Select "Open with Live Server"

## Customization Guide

### 1. Change Restaurant Name
**In `index.html`:**
- Line 6: Update `<title>` tag
- Line 18-19: Update logo text
- Throughout the file: Replace "Burger House" with your name

### 2. Update Colors
**In `styles.css` (lines 8-13):**
```css
:root {
    --primary-color: #FF6B35;    /* Main brand color */
    --secondary-color: #F7931E;  /* Accent color */
    --dark-color: #1a1a1a;       /* Dark text/backgrounds */
    --light-color: #f8f8f8;      /* Light backgrounds */
}
```

### 3. Modify Menu Items
**In `index.html` (Menu Section):**
- Find the `.menu-item` divs
- Update:
  - Image source
  - Burger name (h3)
  - Description (p)
  - Price
  - Badge (Popular, New, Veggie, Premium)

Example:
```html
<div class="menu-item">
    <div class="menu-item-image">
        <img src="your-burger.jpg" alt="Your Burger">
        <span class="menu-badge">Popular</span>
    </div>
    <div class="menu-item-content">
        <h3>Your Burger Name</h3>
        <p>Your description here</p>
        <div class="menu-item-footer">
            <span class="price">$XX.XX</span>
            <button class="btn-add">Add to Order</button>
        </div>
    </div>
</div>
```

### 4. Update Contact Information
**In `index.html` (Contact Section):**
- Address (line ~280)
- Phone number (line ~285)
- Hours (line ~290)
- Email (line ~295)

### 5. Replace Images
- Keep the same filenames OR
- Update the `src` attributes in HTML
- Recommended image sizes:
  - Hero: 1024x1024px
  - Menu items: 512x512px
  - About images: 512x512px

### 6. Social Media Links
**In `index.html` (Footer Section):**
```html
<div class="social-links">
    <a href="YOUR_FACEBOOK_URL">📘</a>
    <a href="YOUR_INSTAGRAM_URL">📷</a>
    <a href="YOUR_TWITTER_URL">🐦</a>
</div>
```

## Adding New Sections

### Example: Add a Gallery Section
```html
<section class="gallery">
    <div class="container">
        <div class="section-header">
            <span class="section-label">Gallery</span>
            <h2 class="section-title">Our Burgers</h2>
        </div>
        <div class="gallery-grid">
            <!-- Add images here -->
        </div>
    </div>
</section>
```

Then add CSS:
```css
.gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
}
```

## Deployment Options

### 1. GitHub Pages (Free)
1. Create a GitHub account
2. Create a new repository
3. Upload all files
4. Go to Settings > Pages
5. Select main branch
6. Your site will be live at `username.github.io/repo-name`

### 2. Netlify (Free)
1. Sign up at netlify.com
2. Drag and drop your folder
3. Site goes live instantly
4. Get a free subdomain or connect your domain

### 3. Vercel (Free)
1. Sign up at vercel.com
2. Import your project
3. Deploy with one click

### 4. Traditional Web Hosting
- Upload files via FTP
- Most hosting providers support static HTML sites
- Popular options: Bluehost, HostGator, SiteGround

## Testing Checklist

- [ ] All links work correctly
- [ ] Mobile menu opens and closes
- [ ] Forms submit (currently show notifications)
- [ ] All images load properly
- [ ] Smooth scrolling works
- [ ] Add to cart buttons provide feedback
- [ ] Site looks good on mobile devices
- [ ] Site looks good on tablets
- [ ] Site looks good on desktop

## Browser Testing

Test in:
- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge
- [ ] Mobile Safari (iPhone)
- [ ] Chrome Mobile (Android)

## Performance Tips

1. **Optimize Images:**
   - Use tools like TinyPNG or ImageOptim
   - Convert to WebP format for better compression
   - Aim for under 200KB per image

2. **Minify Code (for production):**
   - CSS: Use cssnano or clean-css
   - JavaScript: Use UglifyJS or Terser

3. **Enable Caching:**
   - Add cache headers on your server
   - Use a CDN for static assets

## Troubleshooting

### Images Not Showing
- Check file paths are correct
- Ensure images are in the same folder as HTML
- Check file extensions match (jpg vs jpeg)

### Mobile Menu Not Working
- Ensure script.js is loaded
- Check browser console for errors (F12)

### Styling Issues
- Clear browser cache (Ctrl+Shift+R)
- Check styles.css is linked correctly
- Verify CSS file has no syntax errors

## Support

For issues or questions:
1. Check the README.md for detailed documentation
2. Review the code comments
3. Test in different browsers
4. Check browser console for errors

## Next Steps

1. ✅ Customize content and images
2. ✅ Update contact information
3. ✅ Test on multiple devices
4. ✅ Deploy to a hosting service
5. ✅ Connect a custom domain
6. ✅ Set up analytics (Google Analytics)
7. ✅ Add online ordering integration
8. ✅ Implement SEO best practices

---

**Happy building! 🍔**
