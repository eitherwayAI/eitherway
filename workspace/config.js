// Website Configuration
// Edit these values to customize your burger restaurant website

const siteConfig = {
    // Restaurant Information
    restaurantName: "BURGER HOUSE",
    tagline: "Gourmet Burgers & More",
    
    // Contact Information
    contact: {
        phone: "(555) 123-4567",
        email: "info@burgerhouse.com",
        address: {
            street: "123 Burger Street",
            city: "Downtown District",
            state: "City, State 12345"
        }
    },
    
    // Business Hours
    hours: {
        weekday: "Monday - Thursday: 11am - 10pm",
        weekend: "Friday - Saturday: 11am - 11pm",
        sunday: "Sunday: 12pm - 9pm"
    },
    
    // Social Media Links
    social: {
        facebook: "https://facebook.com/yourpage",
        instagram: "https://instagram.com/yourpage",
        twitter: "https://twitter.com/yourpage"
    },
    
    // Brand Colors (CSS Variables)
    colors: {
        primary: "#FF6B35",      // Orange - Main brand color
        secondary: "#F7931E",    // Golden - Accent color
        dark: "#1a1a1a",         // Dark text and backgrounds
        light: "#f8f8f8"         // Light backgrounds
    },
    
    // Menu Items (can be used to dynamically generate menu)
    menuItems: [
        {
            id: 1,
            name: "The Classic",
            description: "Our signature beef patty with lettuce, tomato, pickles, onions, and our secret sauce on a toasted brioche bun",
            price: 12.99,
            image: "burger-classic.jpg",
            badge: "Popular",
            category: "beef"
        },
        {
            id: 2,
            name: "Bacon Bliss",
            description: "Double beef patty, crispy bacon, aged cheddar, caramelized onions, and smoky BBQ sauce",
            price: 15.99,
            image: "burger-bacon.jpg",
            badge: "New",
            category: "beef"
        },
        {
            id: 3,
            name: "Mushroom Swiss",
            description: "Juicy beef patty topped with sautéed mushrooms, Swiss cheese, garlic aioli, and arugula",
            price: 14.99,
            image: "burger-mushroom.jpg",
            badge: null,
            category: "beef"
        },
        {
            id: 4,
            name: "Spicy Jalapeño",
            description: "Pepper jack cheese, jalapeños, chipotle mayo, crispy onion rings, and our spicy house sauce",
            price: 13.99,
            image: "burger-spicy.jpg",
            badge: null,
            category: "beef"
        },
        {
            id: 5,
            name: "Garden Delight",
            description: "House-made veggie patty with avocado, sprouts, tomato, cucumber, and herb mayo",
            price: 11.99,
            image: "burger-veggie.jpg",
            badge: "Veggie",
            category: "vegetarian"
        },
        {
            id: 6,
            name: "Wagyu Deluxe",
            description: "Premium wagyu beef, truffle aioli, caramelized onions, brie cheese, and arugula",
            price: 19.99,
            image: "burger-premium.jpg",
            badge: "Premium",
            category: "premium"
        }
    ],
    
    // Sides and Extras
    extras: [
        { name: "Classic Fries", price: 4.99 },
        { name: "Sweet Potato Fries", price: 5.99 },
        { name: "Onion Rings", price: 5.49 },
        { name: "Milkshakes", price: 6.99 },
        { name: "Soft Drinks", price: 2.99 },
        { name: "Craft Beer", price: 7.99 }
    ],
    
    // Customer Testimonials
    testimonials: [
        {
            name: "Sarah M.",
            role: "Local Food Blogger",
            rating: 5,
            text: "Best burgers in town! The Classic is absolutely perfect, and the fries are crispy and delicious. Will definitely be back!"
        },
        {
            name: "Mike R.",
            role: "Regular Customer",
            rating: 5,
            text: "The Wagyu Deluxe is worth every penny. The quality of ingredients really shines through. Amazing atmosphere too!"
        },
        {
            name: "Emma L.",
            role: "Vegetarian Foodie",
            rating: 5,
            text: "Finally, a place that makes a great veggie burger! The Garden Delight is packed with flavor and so fresh."
        }
    ],
    
    // Features (About Section)
    features: [
        {
            icon: "🥩",
            title: "Premium Beef",
            description: "100% grass-fed, locally sourced beef ground fresh daily"
        },
        {
            icon: "🍞",
            title: "Artisan Buns",
            description: "Freshly baked brioche buns made in-house every morning"
        },
        {
            icon: "🌱",
            title: "Fresh Ingredients",
            description: "Locally sourced vegetables and house-made sauces"
        },
        {
            icon: "👨‍🍳",
            title: "Expert Chefs",
            description: "Passionate culinary team with years of experience"
        }
    ],
    
    // SEO Settings
    seo: {
        title: "Burger House - Gourmet Burgers & More",
        description: "Experience the best gourmet burgers in town. Made with premium ingredients, fresh daily. Order online or visit us today!",
        keywords: "burgers, gourmet burgers, restaurant, food, dining, takeout, delivery"
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = siteConfig;
}

// Make available globally
window.siteConfig = siteConfig;

// Helper function to format price
function formatPrice(price) {
    return `$${price.toFixed(2)}`;
}

// Helper function to generate star rating
function generateStars(rating) {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

// Console message for developers
console.log('%c🍔 Burger House Website', 'font-size: 20px; font-weight: bold; color: #FF6B35;');
console.log('%cEdit config.js to customize your restaurant details', 'font-size: 12px; color: #666;');
