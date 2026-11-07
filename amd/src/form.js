// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Multi-provider video source form handler and real-time metadata resolver for mod_smartvideo.
 *
 * @module     mod_smartvideo/form
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['core/ajax', 'core/notification'], function(Ajax, Notification) {
    'use strict';

    let debounceTimer = null;

    /**
     * Format seconds to mm:ss or hh:mm:ss.
     *
     * @param {number} totalSecs
     * @return {string}
     */
    function formatTime(totalSecs) {
        const s = Math.max(0, Math.floor(totalSecs || 0));
        const hours = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        if (hours > 0) {
            return String(hours).padStart(2, '0') + ':' +
                   String(mins).padStart(2, '0') + ':' +
                   String(secs).padStart(2, '0');
        }
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    /**
     * Escape HTML string.
     *
     * @param {string} str
     * @return {string}
     */
    function escapeHtml(str) {
        if (!str) {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Detect provider from input URL.
     *
     * @param {string} rawUrl
     * @return {Object|null}
     */
    function detectProvider(rawUrl) {
        const url = (rawUrl || '').trim();
        if (!url) {
            return null;
        }

        // 1. YouTube.
        const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/(?:embed\/|watch\?v=|\/)?([a-zA-Z0-9_-]{11})/i;
        const ytMatch = ytRegex.exec(url);
        if (ytMatch && ytMatch[1]) {
            return {
                provider: 'youtube',
                name: 'YouTube',
                badgeClass: 'bg-danger',
                id: ytMatch[1],
                cleanUrl: 'https://www.youtube.com/watch?v=' + ytMatch[1]
            };
        }

        // 2. Vimeo.
        const vimeoRegex = /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^/]*\/videos\/|album\/\d+\/video\/|video\/|)(\d+)/i;
        const vimeoMatch = vimeoRegex.exec(url);
        if (vimeoMatch && vimeoMatch[1]) {
            return {
                provider: 'vimeo',
                name: 'Vimeo',
                badgeClass: 'bg-info text-dark',
                id: vimeoMatch[1],
                cleanUrl: 'https://vimeo.com/' + vimeoMatch[1]
            };
        }

        // 3. Bunny Stream.
        const bunnyRegex = /https?:\/\/(?:iframe|player)\.mediadelivery\.net\/(?:embed|watch|play)\/(\d+)\/([a-zA-Z0-9-]+)/i;
        const bunnyMatch = bunnyRegex.exec(url);
        if (bunnyMatch && bunnyMatch[2]) {
            return {
                provider: 'bunnystream',
                name: 'Bunny Stream',
                badgeClass: 'bg-warning text-dark',
                id: bunnyMatch[2],
                libraryId: bunnyMatch[1],
                cleanUrl: url
            };
        }

        // 4. VdoCipher.
        const vdoRegex = /(?:https?:\/\/)?(?:www\.)?vdocipher\.com\/dashboard\/video\/(?:embed\/|)([a-zA-Z0-9_-]+)/i;
        const vdoMatch = vdoRegex.exec(url);
        if (vdoMatch && vdoMatch[1]) {
            return {
                provider: 'vdocipher',
                name: 'VdoCipher',
                badgeClass: 'bg-primary',
                id: vdoMatch[1],
                cleanUrl: url
            };
        }

        // 5. Dailymotion.
        const dmRegex = /(?:https?:\/\/)?(?:www\.)?(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/?#]+)/i;
        const dmMatch = dmRegex.exec(url);
        if (dmMatch && dmMatch[1]) {
            return {
                provider: 'dailymotion',
                name: 'Dailymotion',
                badgeClass: 'bg-dark',
                id: dmMatch[1],
                cleanUrl: 'https://www.dailymotion.com/video/' + dmMatch[1]
            };
        }

        // 6. Wistia.
        const wistiaRegex = /(?:https?:\/\/)?(?:www\.)?(?:[^.]+\.)*wistia\.com\/medias\/([^/?#]+)/i;
        const wistiaMatch = wistiaRegex.exec(url);
        if (wistiaMatch && wistiaMatch[1]) {
            return {
                provider: 'wistia',
                name: 'Wistia',
                badgeClass: 'bg-success',
                id: wistiaMatch[1],
                cleanUrl: url
            };
        }

        // 7. Direct Video / HTML5 (.mp4, .webm, .m3u8, .mpd).
        if (/\.(mp4|webm|ogv|m3u8|mpd)(\?.*)?$/i.test(url) || url.startsWith('http://') || url.startsWith('https://')) {
            return {
                provider: 'html5video',
                name: 'Direct Video / HLS',
                badgeClass: 'bg-secondary',
                id: url,
                cleanUrl: url
            };
        }

        return null;
    }

    /**
     * Fetch metadata from external provider.
     *
     * @param {Object} detected
     * @param {string} fullUrl
     * @return {Promise<Object>}
     */
    function resolveMetadata(detected, fullUrl) {
        return new Promise(function(resolve) {
            const provider = detected.provider;

            if (provider === 'youtube') {
                const oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(detected.cleanUrl) + '&format=json';
                fetch(oembedUrl).then(function(res) {
                    return res.ok ? res.json() : null;
                }).then(function(data) {
                    resolve({
                        title: data ? data.title : 'YouTube Video (' + detected.id + ')',
                        poster: 'https://img.youtube.com/vi/' + detected.id + '/hqdefault.jpg',
                        duration: 0
                    });
                }).catch(function() {
                    resolve({
                        title: 'YouTube Video (' + detected.id + ')',
                        poster: 'https://img.youtube.com/vi/' + detected.id + '/hqdefault.jpg',
                        duration: 0
                    });
                });
                return;
            }

            if (provider === 'vimeo') {
                const proxyUrl = M.cfg.wwwroot + '/mod/smartvideo/ajax.php?action=get_from_url&sesskey=' +
                    encodeURIComponent(M.cfg.sesskey) + '&url=' +
                    encodeURIComponent('https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(detected.cleanUrl));

                fetch(proxyUrl).then(function(res) {
                    return res.ok ? res.json() : null;
                }).then(function(data) {
                    if (data && !data.error) {
                        resolve({
                            title: data.title || 'Vimeo Video',
                            poster: (data.thumbnail_url || '').replace(/_\d+x\d+/, '_640x360'),
                            duration: data.duration || 0
                        });
                    } else {
                        resolve({
                            title: 'Vimeo Video (' + detected.id + ')',
                            poster: '',
                            duration: 0
                        });
                    }
                }).catch(function() {
                    resolve({
                        title: 'Vimeo Video (' + detected.id + ')',
                        poster: '',
                        duration: 0
                    });
                });
                return;
            }

            if (provider === 'bunnystream') {
                const bunnyOembed = 'https://video.bunnycdn.com/OEmbed?url=' + encodeURIComponent(fullUrl);
                const proxyUrl = M.cfg.wwwroot + '/mod/smartvideo/ajax.php?action=get_from_url&sesskey=' +
                    encodeURIComponent(M.cfg.sesskey) + '&url=' + encodeURIComponent(bunnyOembed);

                fetch(proxyUrl).then(function(res) {
                    return res.ok ? res.json() : null;
                }).then(function(data) {
                    if (data && data.title) {
                        resolve({
                            title: data.title,
                            poster: data.thumbnail_url || '',
                            duration: 0
                        });
                    } else {
                        resolve({
                            title: 'Bunny Stream Video',
                            poster: '',
                            duration: 0
                        });
                    }
                }).catch(function() {
                    resolve({
                        title: 'Bunny Stream Video',
                        poster: '',
                        duration: 0
                    });
                });
                return;
            }

            if (provider === 'vdocipher') {
                const vdoUrl = M.cfg.wwwroot + '/mod/smartvideo/ajax.php?action=get_vdocipher&sesskey=' +
                    encodeURIComponent(M.cfg.sesskey) + '&videoid=' + encodeURIComponent(detected.id) + '&info=info';

                fetch(vdoUrl).then(function(res) {
                    return res.ok ? res.json() : null;
                }).then(function(data) {
                    if (data && !data.error) {
                        resolve({
                            title: data.title || 'VdoCipher Video',
                            poster: data.poster || '',
                            duration: data.length || 0
                        });
                    } else {
                        resolve({
                            title: 'VdoCipher Video (' + detected.id + ')',
                            poster: '',
                            duration: 0,
                            error: data ? data.error : null
                        });
                    }
                }).catch(function() {
                    resolve({
                        title: 'VdoCipher Video (' + detected.id + ')',
                        poster: '',
                        duration: 0
                    });
                });
                return;
            }

            if (provider === 'dailymotion') {
                const dmApi = 'https://api.dailymotion.com/video/' + encodeURIComponent(detected.id) +
                    '?fields=title,duration,thumbnail_720_url';
                const proxyUrl = M.cfg.wwwroot + '/mod/smartvideo/ajax.php?action=get_from_url&sesskey=' +
                    encodeURIComponent(M.cfg.sesskey) + '&url=' + encodeURIComponent(dmApi);

                fetch(proxyUrl).then(function(res) {
                    return res.ok ? res.json() : null;
                }).then(function(data) {
                    if (data && data.title) {
                        resolve({
                            title: data.title,
                            poster: data.thumbnail_720_url || '',
                            duration: data.duration || 0
                        });
                    } else {
                        resolve({
                            title: 'Dailymotion Video (' + detected.id + ')',
                            poster: '',
                            duration: 0
                        });
                    }
                }).catch(function() {
                    resolve({
                        title: 'Dailymotion Video (' + detected.id + ')',
                        poster: '',
                        duration: 0
                    });
                });
                return;
            }

            if (provider === 'wistia') {
                const wistiaOembed = 'https://fast.wistia.com/oembed.json?url=' + encodeURIComponent(fullUrl);
                const proxyUrl = M.cfg.wwwroot + '/mod/smartvideo/ajax.php?action=get_from_url&sesskey=' +
                    encodeURIComponent(M.cfg.sesskey) + '&url=' + encodeURIComponent(wistiaOembed);

                fetch(proxyUrl).then(function(res) {
                    return res.ok ? res.json() : null;
                }).then(function(data) {
                    if (data && data.title) {
                        resolve({
                            title: data.title,
                            poster: data.thumbnail_url || '',
                            duration: Math.round(data.duration || 0)
                        });
                    } else {
                        resolve({
                            title: 'Wistia Video (' + detected.id + ')',
                            poster: '',
                            duration: 0
                        });
                    }
                }).catch(function() {
                    resolve({
                        title: 'Wistia Video (' + detected.id + ')',
                        poster: '',
                        duration: 0
                    });
                });
                return;
            }

            // HTML5 direct link.
            const tempVid = document.createElement('video');
            tempVid.preload = 'metadata';
            tempVid.src = fullUrl;
            tempVid.onloadedmetadata = function() {
                resolve({
                    title: fullUrl.split('/').pop().split('?')[0] || 'Direct Video Stream',
                    poster: '',
                    duration: Math.round(tempVid.duration || 0)
                });
            };
            tempVid.onerror = function() {
                resolve({
                    title: fullUrl.split('/').pop().split('?')[0] || 'Direct Video Stream',
                    poster: '',
                    duration: 0
                });
            };
            // Fallback timeout after 3s.
            setTimeout(function() {
                resolve({
                    title: fullUrl.split('/').pop().split('?')[0] || 'Direct Video Stream',
                    poster: '',
                    duration: 0
                });
            }, 3000);
        });
    }

    /**
     * Update the external preview DOM and hidden form inputs.
     *
     * @param {Object} detected
     * @param {Object} meta
     */
    function updatePreview(detected, meta) {
        const previewContainer = document.getElementById('smartvideo_external_preview');
        const videosourceInput = document.querySelector('input[name="videosource"]');
        const durationInput = document.querySelector('input[name="duration"]');
        const posterimageInput = document.querySelector('input[name="posterimage"]');
        const nameInput = document.getElementById('id_name') || document.querySelector('input[name="name"]');

        if (videosourceInput) {
            videosourceInput.value = detected.provider;
        }
        if (durationInput) {
            durationInput.value = meta.duration || 0;
        }
        if (posterimageInput) {
            posterimageInput.value = meta.poster || '';
        }

        // Auto-fill activity name if empty.
        if (nameInput && !nameInput.value.trim() && meta.title) {
            nameInput.value = meta.title;
        }

        if (previewContainer) {
            const thumbHtml = meta.poster ?
                '<img src="' + escapeHtml(meta.poster) + '" alt="" class="w-100 h-100 object-fit-cover" style="object-fit: cover;">' :
                '<div class="w-100 h-100 d-flex align-items-center justify-content-center bg-dark text-white"><i class="fa fa-play fa-2x" aria-hidden="true"></i></div>';

            const durBadge = meta.duration > 0 ?
                '<span class="badge bg-secondary mb-1">' + formatTime(meta.duration) + '</span>' : '';

            previewContainer.innerHTML =
                '<div class="card border p-3 d-flex flex-row align-items-center gap-3 bg-light shadow-sm" style="max-width: 550px;">' +
                    '<div class="ratio ratio-16x9 bg-dark rounded overflow-hidden" style="width: 140px; flex-shrink: 0;">' +
                        thumbHtml +
                    '</div>' +
                    '<div class="flex-grow-1 overflow-hidden">' +
                        '<div class="mb-1"><span class="badge ' + detected.badgeClass + '">' + escapeHtml(detected.name) + '</span></div>' +
                        '<strong class="d-block text-truncate mb-1">' + escapeHtml(meta.title) + '</strong>' +
                        durBadge +
                        '<div class="text-muted small text-truncate">' + escapeHtml(detected.cleanUrl) + '</div>' +
                    '</div>' +
                '</div>';
        }
    }

    /**
     * Handle URL input event with debounce.
     */
    function onUrlInput() {
        const urlInput = document.getElementById('id_videourl') || document.querySelector('input[name="videourl"]');
        const previewContainer = document.getElementById('smartvideo_external_preview');
        const statusEl = document.getElementById('smartvideo_external_status');

        if (!urlInput) {
            return;
        }

        clearTimeout(debounceTimer);
        const val = urlInput.value.trim();

        if (!val) {
            if (previewContainer) {
                previewContainer.innerHTML = '';
            }
            if (statusEl) {
                statusEl.innerHTML = '';
            }
            return;
        }

        const detected = detectProvider(val);
        if (!detected) {
            if (statusEl) {
                statusEl.innerHTML = '<div class="text-danger small mt-1"><i class="fa fa-exclamation-circle me-1"></i>URL not recognized as supported provider.</div>';
            }
            return;
        }

        if (statusEl) {
            statusEl.innerHTML = '<div class="text-muted small mt-1"><i class="fa fa-spinner fa-spin me-1"></i>Detecting ' + escapeHtml(detected.name) + ' metadata...</div>';
        }

        debounceTimer = setTimeout(function() {
            resolveMetadata(detected, val).then(function(meta) {
                if (statusEl) {
                    statusEl.innerHTML = '';
                }
                updatePreview(detected, meta);
            });
        }, 350);
    }

    /**
     * Toggle form visibility between Secure Library and External URL modes.
     */
    function setupSourceTypeToggle() {
        const radios = document.querySelectorAll('input[name="sourcetype"]');
        const libraryGroup = document.getElementById('fitem_id_videopreview') ?
            document.getElementById('fitem_id_videopreview').closest('.fitem, .form-group') : null;
        const libraryBtnGroup = document.getElementById('fitem_id_selectvideobutton') ?
            document.getElementById('fitem_id_selectvideobutton').closest('.fitem, .form-group') : null;
        const externalGroup = document.getElementById('fitem_id_videourl') ?
            document.getElementById('fitem_id_videourl').closest('.fitem, .form-group') : null;
        const externalPreviewGroup = document.getElementById('fitem_id_externalpreview') ?
            document.getElementById('fitem_id_externalpreview').closest('.fitem, .form-group') : null;

        function applyToggle(type) {
            const isLib = (type === 'securelibrary');
            if (libraryGroup) {
                libraryGroup.style.display = isLib ? '' : 'none';
            }
            if (libraryBtnGroup) {
                libraryBtnGroup.style.display = isLib ? '' : 'none';
            }
            if (externalGroup) {
                externalGroup.style.display = isLib ? 'none' : '';
            }
            if (externalPreviewGroup) {
                externalPreviewGroup.style.display = isLib ? 'none' : '';
            }
        }

        radios.forEach(function(radio) {
            radio.addEventListener('change', function() {
                if (radio.checked) {
                    applyToggle(radio.value);
                }
            });
            if (radio.checked) {
                applyToggle(radio.value);
            }
        });
    }

    return {
        /**
         * Initialize form listeners.
         */
        init: function() {
            setupSourceTypeToggle();

            const urlInput = document.getElementById('id_videourl') || document.querySelector('input[name="videourl"]');
            if (urlInput) {
                urlInput.addEventListener('input', onUrlInput);
                urlInput.addEventListener('change', onUrlInput);
                // Trigger once if already populated.
                if (urlInput.value.trim()) {
                    onUrlInput();
                }
            }
        }
    };
});
