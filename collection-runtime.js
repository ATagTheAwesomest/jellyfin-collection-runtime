// Jellyfin Collection Total Runtime
// Inject this script into the Jellyfin web client to display total runtime on collection detail pages.
// Works by extracting item IDs from collection cards and fetching runtimes via the Jellyfin API.

(function () {
    'use strict';

    const POLL_INTERVAL = 1500;
    const RUNTIME_ELEMENT_ID = 'collection-total-runtime';
    const ENDSAT_ELEMENT_ID = 'collection-ends-at';
    const LOG_PREFIX = '[CollectionRuntime]';

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function logWarn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }

    log('Script loaded');

    function getCollectionId() {
        const hash = window.location.hash;
        const match = hash.match(/[?&]id=([^&]+)/);
        return match ? match[1] : null;
    }

    function isCollectionPage() {
        const hash = window.location.hash;
        // Must be on a detail page
        const isDetailPage = hash.startsWith('#/details');
        // The detail page must have the .collectionItems section visible in the current view
        const detailPage = document.querySelector('.page:not(.hide)');
        const hasCollectionItems = detailPage
            ? detailPage.querySelector('.collectionItems') !== null
            : document.querySelector('.collectionItems') !== null;
        const result = isDetailPage && hasCollectionItems;
        log('isCollectionPage:', result, '| isDetailPage:', isDetailPage, '| hasCollectionItems:', hasCollectionItems, '| URL:', hash);
        return result;
    }

    function getItemIdsFromCards() {
        // Scope to the active/visible page to avoid picking up cards from other SPA pages
        const activePage = document.querySelector('.page:not(.hide)');
        const root = activePage || document;
        const cards = root.querySelectorAll('.collectionItemsContainer .card[data-id][data-type="Movie"]');
        const ids = [];
        cards.forEach(function (card) {
            const id = card.getAttribute('data-id');
            if (id) ids.push(id);
        });
        log('Found', cards.length, 'movie cards, extracted', ids.length, 'IDs:', ids);
        return ids;
    }

    function ticksToMinutes(ticks) {
        return Math.floor(ticks / 600000000);
    }

    function formatRuntime(totalMinutes) {
        if (totalMinutes <= 0) return '0m';
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0 && minutes > 0) return hours + 'h ' + minutes + 'm';
        if (hours > 0) return hours + 'h';
        return minutes + 'm';
    }

    function formatEndsAt(totalMinutes) {
        const now = new Date();
        const end = new Date(now.getTime() + totalMinutes * 60000);
        let hours = end.getHours();
        const mins = end.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const minsStr = mins < 10 ? '0' + mins : '' + mins;
        return 'Ends at ' + hours + ':' + minsStr + ' ' + ampm;
    }

    function getApiClient() {
        // Jellyfin web client exposes ApiClient globally
        if (window.ApiClient) {
            log('Using window.ApiClient');
            return window.ApiClient;
        }
        // Fallback: try to find it through the Emby namespace
        if (window.Emby && window.Emby.Page && window.Emby.Page.apiClient) {
            log('Using Emby.Page.apiClient (fallback)');
            return window.Emby.Page.apiClient;
        }
        logWarn('ApiClient not found on window or Emby namespace');
        return null;
    }

    async function fetchItemRuntime(apiClient, itemId) {
        try {
            const userId = apiClient.getCurrentUserId();
            const serverUrl = apiClient.serverAddress();
            const token = apiClient.accessToken();

            const url = serverUrl + '/Users/' + userId + '/Items/' + encodeURIComponent(itemId);
            log('Fetching item:', itemId, '| URL:', url);
            const response = await fetch(url, {
                headers: {
                    'Authorization': 'MediaBrowser Token="' + token + '"'
                }
            });

            if (!response.ok) {
                logWarn('API request failed for', itemId, '| Status:', response.status, response.statusText);
                return 0;
            }
            const data = await response.json();
            const ticks = data.RunTimeTicks || 0;
            const mins = Math.floor(ticks / 600000000);
            log('Item:', data.Name || itemId, '| RunTimeTicks:', ticks, '|', mins, 'min');
            return ticks;
        } catch (e) {
            logWarn('Failed to fetch runtime for', itemId, e);
            return 0;
        }
    }

    function insertRuntimeElement(text) {
        // Remove existing element if present
        const existing = document.getElementById(RUNTIME_ELEMENT_ID);
        if (existing) {
            log('Updating runtime element:', text);
            existing.textContent = text;
            return;
        }

        const header = document.querySelector('.itemMiscInfo.itemMiscInfo-primary');
        if (!header) {
            logWarn('Header .itemMiscInfo-primary not found, cannot insert runtime');
            return;
        }

        // Find the rating element to insert after it
        let insertAfter = header.querySelector('.mediaInfoOfficialRating');
        log('Rating element found:', !!insertAfter);
        if (!insertAfter) {
            // Fallback: find the "X items" element
            const infoItems = header.querySelectorAll('.mediaInfoItem');
            for (let i = 0; i < infoItems.length; i++) {
                const txt = infoItems[i].textContent.trim();
                if (/^\d+\s+items?$/i.test(txt)) {
                    insertAfter = infoItems[i];
                    break;
                }
            }
        }

        const el = document.createElement('div');
        el.id = RUNTIME_ELEMENT_ID;
        el.className = 'mediaInfoItem';
        el.textContent = text;

        if (insertAfter && insertAfter.nextSibling) {
            header.insertBefore(el, insertAfter.nextSibling);
        } else if (insertAfter) {
            header.appendChild(el);
        } else {
            // Fallback: insert as second child (after first mediaInfoItem)
            const first = header.querySelector('.mediaInfoItem');
            if (first && first.nextSibling) {
                header.insertBefore(el, first.nextSibling);
            } else {
                header.appendChild(el);
            }
        }
    }

    function insertEndsAtElement(text) {
        const existing = document.getElementById(ENDSAT_ELEMENT_ID);
        if (existing) {
            log('Updating ends-at element:', text);
            existing.textContent = text;
            return;
        }

        const header = document.querySelector('.itemMiscInfo.itemMiscInfo-primary');
        if (!header) {
            logWarn('Header .itemMiscInfo-primary not found, cannot insert ends-at');
            return;
        }

        // Insert after the runtime element
        const runtimeEl = document.getElementById(RUNTIME_ELEMENT_ID);

        const el = document.createElement('div');
        el.id = ENDSAT_ELEMENT_ID;
        el.className = 'endsAt mediaInfoItem';
        el.textContent = text;

        if (runtimeEl && runtimeEl.nextSibling) {
            header.insertBefore(el, runtimeEl.nextSibling);
        } else if (runtimeEl) {
            header.appendChild(el);
        } else {
            header.appendChild(el);
        }
    }

    async function calculateAndDisplayRuntime() {
        log('calculateAndDisplayRuntime triggered');
        if (!isCollectionPage()) return;

        // Don't re-run if already displayed and cards haven't changed
        const existing = document.getElementById(RUNTIME_ELEMENT_ID);
        const itemIds = getItemIdsFromCards();

        if (itemIds.length === 0) {
            log('No movie cards found, skipping');
            return;
        }

        const currentKey = itemIds.join(',');
        if (existing && existing.getAttribute('data-ids') === currentKey) {
            log('Runtime already displayed for these items, skipping');
            return;
        }

        const apiClient = getApiClient();
        if (!apiClient) {
            logWarn('ApiClient not available, cannot fetch runtimes');
            return;
        }

        log('Fetching runtimes for', itemIds.length, 'items...');
        insertRuntimeElement('Loading...');
        insertEndsAtElement('');

        // Fetch all runtimes in parallel
        const runtimePromises = itemIds.map(function (id) {
            return fetchItemRuntime(apiClient, id);
        });
        const runtimes = await Promise.all(runtimePromises);
        const totalTicks = runtimes.reduce(function (sum, t) { return sum + t; }, 0);
        const totalMinutes = ticksToMinutes(totalTicks);
        const formatted = formatRuntime(totalMinutes);
        const endsAt = formatEndsAt(totalMinutes);

        log('--- Results ---');
        log('Total ticks:', totalTicks);
        log('Total minutes:', totalMinutes);
        log('Formatted runtime:', formatted);
        log('Ends at:', endsAt);
        log('---------------');

        insertRuntimeElement(formatted);
        insertEndsAtElement(endsAt);

        // Tag with current IDs so we don't refetch unnecessarily
        const el = document.getElementById(RUNTIME_ELEMENT_ID);
        if (el) el.setAttribute('data-ids', currentKey);

        log('Done. Displayed', formatted, 'and', endsAt, 'for', itemIds.length, 'items');
    }

    // Observe page changes since Jellyfin is a SPA
    let lastHash = '';
    function poll() {
        const currentHash = window.location.hash;
        if (currentHash !== lastHash) {
            log('Hash changed:', lastHash, '->', currentHash);
            lastHash = currentHash;
            // Wait for DOM to settle after navigation
            setTimeout(calculateAndDisplayRuntime, 1000);
        }
        setTimeout(poll, POLL_INTERVAL);
    }

    // Also observe DOM mutations for when collection items load asynchronously
    const observer = new MutationObserver(function (mutations) {
        for (const m of mutations) {
            if (m.addedNodes.length > 0) {
                const hasCollectionItems = document.querySelector('.collectionItems');
                const noRuntime = !document.getElementById(RUNTIME_ELEMENT_ID);
                if (hasCollectionItems && noRuntime) {
                    log('MutationObserver: .collectionItems detected, triggering runtime calculation');
                    setTimeout(calculateAndDisplayRuntime, 500);
                    break;
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    log('Document readyState:', document.readyState);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        log('DOM ready, scheduling initial run');
        setTimeout(calculateAndDisplayRuntime, 1000);
    } else {
        log('Waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', function () {
            log('DOMContentLoaded fired, scheduling initial run');
            setTimeout(calculateAndDisplayRuntime, 1000);
        });
    }

    log('Starting hash poll (interval:', POLL_INTERVAL, 'ms)');
    poll();
})();
