let games = [];
        let currentPage = 1;
        const gamesPerPage = 50;

        async function loadGames() {
            try {
                const response = await fetch('/storage/data/games.json');
                games = (await response.json()).games;
                displayGames(games.slice(0, gamesPerPage));
                updateLoadMoreButton();
            } catch (error) {
                console.error('Error loading games:', error);
            }
        }

        function displayGames(gamesToShow, append = false) {
            const container = document.getElementById('imageContainer');
            if (!append) container.innerHTML = '';
            const fragment = document.createDocumentFragment();
            gamesToShow.forEach(game => {
                const div = document.createElement('div');
                div.className = 'image-item';
                div.setAttribute('data-label', game.label);
                if (game.categories.length > 0) {
                    div.setAttribute('data-category', game.categories[0]);
                }
                div.innerHTML = `
                    <a href="${game.url}" class="game-link" data-url="${game.url}">
                        <img src="${game.imageUrl}" alt="${game.label}">
                        <div class="label">${game.label}</div>
                    </a>
                `;
                fragment.appendChild(div);
            });
            container.appendChild(fragment);
        }

        function updateLoadMoreButton() {
            let loadMoreBtn = document.getElementById('loadMoreBtn');
            if (!loadMoreBtn) {
                loadMoreBtn = document.createElement('button');
                loadMoreBtn.id = 'loadMoreBtn';
                loadMoreBtn.textContent = 'Load More';
                loadMoreBtn.style.cssText = `
                    padding: 10px 20px; margin: 20px auto; display: block;
                    background-color: #141414; color: white; border: 1px solid white;
                    font-size: 16px; cursor: pointer; border-radius: 16px;
                `;
                loadMoreBtn.addEventListener('click', () => {
                    const start = currentPage * gamesPerPage;
                    const end = start + gamesPerPage;
                    const filteredGames = getFilteredGames();
                    displayGames(filteredGames.slice(start, end), true);
                    currentPage++;
                    if (end >= filteredGames.length) loadMoreBtn.style.display = 'none';
                });
                document.getElementById('imageContainer').after(loadMoreBtn);
            }
            loadMoreBtn.style.display = currentPage * gamesPerPage < getFilteredGames().length ? 'block' : 'none';
        }

        function debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        function getFilteredGames() {
            const searchInput = document.getElementById('search-games').value.toLowerCase();
            const category = document.getElementById('gameFilter').value.toLowerCase();
            let filteredGames = games;
            if (searchInput) {
                filteredGames = filteredGames.filter(game => game.label.toLowerCase().includes(searchInput));
            }
            if (category) {
                filteredGames = filteredGames.filter(game => game.categories.includes(category));
            }
            return filteredGames;
        }

        function filterItems() {
            currentPage = 1;
            const filteredGames = getFilteredGames();
            displayGames(filteredGames.slice(0, gamesPerPage));
            updateLoadMoreButton();
        }

        function randomGameOpen() {
            if (games.length > 0) {
                const randomIndex = Math.floor(Math.random() * games.length);
                window.location.href = games[randomIndex].url;
            }
        }

        function filterByCategory() {
            filterItems();
        }

        document.getElementById('imageContainer').addEventListener('click', (e) => {
            const link = e.target.closest('.game-link');
            if (link) {
                e.preventDefault();
                window.location.href = link.getAttribute('data-url');
            }
        });

        window.addEventListener('scroll', debounce(() => {
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn && loadMoreBtn.style.display !== 'none' && loadMoreBtn.offsetParent !== null) {
                const docHeight = Math.max(
                    document.body.scrollHeight, document.documentElement.scrollHeight,
                    document.body.offsetHeight, document.documentElement.offsetHeight,
                    document.body.clientHeight, document.documentElement.clientHeight
                );
                const scrollPosition = window.scrollY + window.innerHeight;
                const threshold = 200;
                if (scrollPosition >= docHeight - threshold) {
                    loadMoreBtn.click();
                }
            }
        }, 100));

        document.addEventListener('DOMContentLoaded', () => {
            loadGames();
            document.getElementById('search-games').addEventListener('input', debounce(filterItems, 300));
        });