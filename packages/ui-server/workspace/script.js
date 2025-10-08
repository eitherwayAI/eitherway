// Sample posts data
const initialPosts = [
    {
        id: 1,
        community: 'photography',
        communityName: 'r/photography',
        author: 'NatureLover_42',
        timestamp: '3 hours ago',
        title: 'Captured this stunning sunset in the Rocky Mountains last weekend',
        text: 'After hiking for 6 hours, we reached the peak just in time for this incredible view. The colors were even more vibrant in person!',
        image: 'images/post1.jpg',
        votes: 12847,
        comments: 234,
        userVote: 0
    },
    {
        id: 2,
        community: 'battlestations',
        communityName: 'r/battlestations',
        author: 'CodeWarrior',
        timestamp: '5 hours ago',
        title: 'Finally finished my minimalist workspace setup!',
        text: 'Took me 3 months to get everything just right. The plants really make a difference in productivity.',
        image: 'images/post2.jpg',
        votes: 8432,
        comments: 156,
        userVote: 0
    },
    {
        id: 3,
        community: 'programming',
        communityName: 'r/programming',
        author: 'DevMaster2000',
        timestamp: '7 hours ago',
        title: 'Just refactored 10,000 lines of legacy code into this beautiful architecture',
        text: 'Started with spaghetti code from 2010. After 2 weeks of refactoring, we now have clean, maintainable code with proper separation of concerns. The team is much happier!',
        image: 'images/post3.jpg',
        votes: 15203,
        comments: 412,
        userVote: 0
    },
    {
        id: 4,
        community: 'aww',
        communityName: 'r/aww',
        author: 'PuppyParent',
        timestamp: '2 hours ago',
        title: 'Meet Cooper! He just discovered grass for the first time 🥺',
        text: 'Our 8-week-old golden retriever experiencing the outdoors. He couldn\'t stop rolling around!',
        image: 'images/post4.jpg',
        votes: 24156,
        comments: 567,
        userVote: 0
    },
    {
        id: 5,
        community: 'cyberpunk',
        communityName: 'r/cyberpunk',
        author: 'NeonDreamer',
        timestamp: '12 hours ago',
        title: 'The future is now - downtown at 3AM',
        text: 'Took this shot while wandering around the city. The neon reflections on the wet streets gave me major cyberpunk vibes.',
        image: 'images/post5.jpg',
        votes: 18923,
        comments: 289,
        userVote: 0
    },
    {
        id: 6,
        community: 'technology',
        communityName: 'r/technology',
        author: 'TechEnthusiast',
        timestamp: '1 hour ago',
        title: 'New breakthrough in quantum computing achieves 1000+ qubit stability',
        text: 'Researchers at MIT have successfully maintained quantum coherence in a 1000+ qubit system for over 10 seconds, a major milestone that could accelerate practical quantum computing applications.',
        image: null,
        votes: 9845,
        comments: 324,
        userVote: 0
    },
    {
        id: 7,
        community: 'webdev',
        communityName: 'r/webdev',
        author: 'FullStackDev',
        timestamp: '4 hours ago',
        title: 'CSS Grid vs Flexbox: When to use which?',
        text: 'After 5 years of professional web development, here\'s my comprehensive guide on choosing between CSS Grid and Flexbox. TLDR: Use Grid for 2D layouts, Flexbox for 1D layouts.',
        image: null,
        votes: 6721,
        comments: 198,
        userVote: 0
    }
];

let posts = [...initialPosts];
let nextId = 8;

// DOM Elements
const postsContainer = document.getElementById('postsContainer');
const createPostBtn = document.getElementById('createPostBtn');
const createPostModal = document.getElementById('createPostModal');
const closeModal = document.getElementById('closeModal');
const cancelPost = document.getElementById('cancelPost');
const submitPost = document.getElementById('submitPost');
const searchInput = document.getElementById('searchInput');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    renderPosts();
    setupEventListeners();
});

// Render posts
function renderPosts(postsToRender = posts) {
    postsContainer.innerHTML = '';
    
    postsToRender.forEach(post => {
        const postElement = createPostElement(post);
        postsContainer.appendChild(postElement);
    });
}

// Create post element
function createPostElement(post) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.dataset.postId = post.id;
    
    const voteSection = document.createElement('div');
    voteSection.className = 'vote-section';
    voteSection.innerHTML = `
        <button class="vote-btn vote-up ${post.userVote === 1 ? 'upvoted' : ''}" data-action="upvote">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4L14 12H6L10 4Z" fill="currentColor"/>
            </svg>
        </button>
        <span class="vote-count">${formatVotes(post.votes)}</span>
        <button class="vote-btn vote-down ${post.userVote === -1 ? 'downvoted' : ''}" data-action="downvote">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 16L6 8H14L10 16Z" fill="currentColor"/>
            </svg>
        </button>
    `;
    
    const content = document.createElement('div');
    content.className = 'post-content';
    content.innerHTML = `
        <div class="post-header">
            <img src="https://api.dicebear.com/7.x/shapes/svg?seed=${post.community}" alt="${post.communityName}" class="community-avatar">
            <a href="#" class="community-name">${post.communityName}</a>
            <span class="post-meta">
                • Posted by u/${post.author} • ${post.timestamp}
            </span>
        </div>
        <h2 class="post-title">${post.title}</h2>
        ${post.text ? `<p class="post-text">${post.text}</p>` : ''}
        ${post.image ? `<img src="${post.image}" alt="${post.title}" class="post-image">` : ''}
        <div class="post-actions">
            <button class="action-btn">
                <svg viewBox="0 0 20 20" fill="none">
                    <path d="M2 10C2 10 5 4 10 4C15 4 18 10 18 10C18 10 15 16 10 16C5 16 2 10 2 10Z" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="10" cy="10" r="2" stroke="currentColor" stroke-width="1.5"/>
                </svg>
                ${formatNumber(post.comments)} Comments
            </button>
            <button class="action-btn">
                <svg viewBox="0 0 20 20" fill="none">
                    <path d="M15 8V4M15 4H11M15 4L9 10M8 4H6C4.89543 4 4 4.89543 4 6V14C4 15.1046 4.89543 16 6 16H14C15.1046 16 16 15.1046 16 14V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Share
            </button>
            <button class="action-btn">
                <svg viewBox="0 0 20 20" fill="none">
                    <path d="M5 10H15M15 10L12 7M15 10L12 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Save
            </button>
        </div>
    `;
    
    article.appendChild(voteSection);
    article.appendChild(content);
    
    return article;
}

// Format vote numbers
function formatVotes(votes) {
    if (votes >= 1000) {
        return (votes / 1000).toFixed(1) + 'k';
    }
    return votes.toString();
}

// Format comment numbers
function formatNumber(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
}

// Setup event listeners
function setupEventListeners() {
    // Modal controls
    createPostBtn.addEventListener('click', () => {
        createPostModal.classList.add('active');
    });
    
    closeModal.addEventListener('click', () => {
        createPostModal.classList.remove('active');
        clearForm();
    });
    
    cancelPost.addEventListener('click', () => {
        createPostModal.classList.remove('active');
        clearForm();
    });
    
    submitPost.addEventListener('click', handleCreatePost);
    
    // Close modal on outside click
    createPostModal.addEventListener('click', (e) => {
        if (e.target === createPostModal) {
            createPostModal.classList.remove('active');
            clearForm();
        }
    });
    
    // Vote buttons
    postsContainer.addEventListener('click', (e) => {
        const voteBtn = e.target.closest('.vote-btn');
        if (voteBtn) {
            handleVote(voteBtn);
        }
    });
    
    // Search
    searchInput.addEventListener('input', handleSearch);
    
    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            handleSort(e.target.textContent.trim());
        });
    });
}

// Handle voting
function handleVote(button) {
    const action = button.dataset.action;
    const postCard = button.closest('.post-card');
    const postId = parseInt(postCard.dataset.postId);
    const post = posts.find(p => p.id === postId);
    
    if (!post) return;
    
    const voteUp = postCard.querySelector('.vote-up');
    const voteDown = postCard.querySelector('.vote-down');
    const voteCount = postCard.querySelector('.vote-count');
    
    // Remove previous vote
    const previousVote = post.userVote;
    post.votes -= previousVote;
    
    // Apply new vote
    if (action === 'upvote') {
        if (previousVote === 1) {
            post.userVote = 0;
            voteUp.classList.remove('upvoted');
        } else {
            post.userVote = 1;
            voteUp.classList.add('upvoted');
            voteDown.classList.remove('downvoted');
        }
    } else {
        if (previousVote === -1) {
            post.userVote = 0;
            voteDown.classList.remove('downvoted');
        } else {
            post.userVote = -1;
            voteDown.classList.add('downvoted');
            voteUp.classList.remove('upvoted');
        }
    }
    
    post.votes += post.userVote;
    voteCount.textContent = formatVotes(post.votes);
}

// Handle create post
function handleCreatePost() {
    const community = document.getElementById('communitySelect').value;
    const title = document.getElementById('postTitle').value.trim();
    const text = document.getElementById('postContent').value.trim();
    const image = document.getElementById('postImage').value.trim();
    
    if (!community || !title) {
        alert('Please select a community and enter a title');
        return;
    }
    
    const newPost = {
        id: nextId++,
        community: community,
        communityName: `r/${community}`,
        author: 'You',
        timestamp: 'just now',
        title: title,
        text: text || null,
        image: image || null,
        votes: 1,
        comments: 0,
        userVote: 1
    };
    
    posts.unshift(newPost);
    renderPosts();
    
    createPostModal.classList.remove('active');
    clearForm();
}

// Clear form
function clearForm() {
    document.getElementById('communitySelect').value = '';
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('postImage').value = '';
}

// Handle search
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
        renderPosts();
        return;
    }
    
    const filteredPosts = posts.filter(post => 
        post.title.toLowerCase().includes(query) ||
        post.text?.toLowerCase().includes(query) ||
        post.communityName.toLowerCase().includes(query) ||
        post.author.toLowerCase().includes(query)
    );
    
    renderPosts(filteredPosts);
}

// Handle sorting
function handleSort(sortType) {
    let sortedPosts = [...posts];
    
    switch(sortType) {
        case 'Hot':
            // Sort by votes (default order)
            sortedPosts.sort((a, b) => b.votes - a.votes);
            break;
        case 'New':
            // Sort by ID (newest first)
            sortedPosts.sort((a, b) => b.id - a.id);
            break;
        case 'Top':
            // Sort by votes
            sortedPosts.sort((a, b) => b.votes - a.votes);
            break;
    }
    
    renderPosts(sortedPosts);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Press 'c' to create post (when not in input)
    if (e.key === 'c' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        createPostModal.classList.add('active');
    }
    
    // Press 'Escape' to close modal
    if (e.key === 'Escape' && createPostModal.classList.contains('active')) {
        createPostModal.classList.remove('active');
        clearForm();
    }
});
