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
 * Hardened HLS player engine, dynamic moving watermark, anti-seek, watch tracker, and in-video interactive questions.
 *
 * @module     mod_smartvideo/player
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['core/ajax', 'core/notification'], function(Ajax, Notification) {
    'use strict';

    /**
     * Load HLS.js library locally via AMD bundle.
     *
     * @return {Promise<window.Hls>}
     */
    function loadHls() {
        return new Promise(function(resolve, reject) {
            if (window.Hls) {
                resolve(window.Hls);
                return;
            }

            require(['local_securevideolibrary/hls-lazy'], function(HlsModule) {
                const Hls = HlsModule || window.Hls;
                if (Hls) {
                    resolve(Hls);
                    return;
                }
                reject(new Error('Local HLS.js library could not be initialized'));
            }, function(err) {
                reject(err || new Error('Failed to load local HLS.js bundle'));
            });
        });
    }

    /**
     * Format seconds into MM:SS or HH:MM:SS.
     *
     * @param {number} totalSeconds
     * @return {string}
     */
    function formatTime(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
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
     * Merge overlapping intervals and compute total unique seconds watched.
     *
     * @param {Array<Array<number>>} intervals
     * @return {{merged: Array<Array<number>>, totalSeconds: number}}
     */
    function mergeIntervals(intervals) {
        if (!intervals || intervals.length === 0) {
            return {merged: [], totalSeconds: 0};
        }

        const sorted = intervals.slice().sort(function(a, b) {
            return a[0] - b[0];
        });

        const merged = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = merged[merged.length - 1];

            if (current[0] <= last[1]) {
                last[1] = Math.max(last[1], current[1]);
            } else {
                merged.push(current);
            }
        }

        let total = 0;
        merged.forEach(function(item) {
            total += Math.max(0, item[1] - item[0]);
        });

        return {merged: merged, totalSeconds: total};
    }

    /**
     * Dynamically inject a script tag if not already loaded.
     *
     * @param {string} src
     * @return {Promise<void>}
     */
    function loadExternalScript(src) {
        return new Promise(function(resolve, reject) {
            const existing = document.querySelector('script[src="' + src + '"]');
            if (existing) {
                if (existing.dataset.loaded === 'true' || window.YT || window.Vimeo || window.playerjs || window.dailymotion || window.VdoPlayer) {
                    resolve();
                    return;
                }
                existing.addEventListener('load', function() {
                    resolve();
                });
                existing.addEventListener('error', function(err) {
                    reject(err);
                });
                return;
            }

            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function() {
                s.dataset.loaded = 'true';
                resolve();
            };
            s.onerror = function(err) {
                reject(err);
            };
            document.head.appendChild(s);
        });
    }

    /**
     * Create base event-driven facade mimicking HTML5 video element.
     *
     * @param {HTMLElement} mountEl
     * @param {number} initialDuration
     * @return {Object}
     */
    function createBaseAdapter(mountEl, initialDuration) {
        const listeners = {};
        let curTime = 0;
        let dur = initialDuration || 0;
        let isPaused = true;
        let isMuted = false;
        let vol = 1.0;
        let rate = 1.0;

        return {
            element: mountEl,
            scrollIntoView: function(opts) {
                if (mountEl && typeof mountEl.scrollIntoView === 'function') {
                    mountEl.scrollIntoView(opts);
                }
            },
            addEventListener: function(event, fn) {
                if (!listeners[event]) {
                    listeners[event] = [];
                }
                listeners[event].push(fn);
            },
            removeEventListener: function(event, fn) {
                if (!listeners[event]) {
                    return;
                }
                listeners[event] = listeners[event].filter(function(cb) {
                    return cb !== fn;
                });
            },
            dispatchEvent: function(event, detail) {
                const cbs = listeners[event] || [];
                const evtObj = {
                    type: event,
                    target: this,
                    currentTarget: this,
                    detail: detail || {}
                };
                cbs.forEach(function(fn) {
                    try {
                        fn(evtObj);
                    } catch (e) {
                        console.error('[SmartVideo Adapter Error]', event, e);
                    }
                });
            },
            get currentTime() {
                return curTime;
            },
            set currentTime(val) {
                curTime = Math.max(0, parseFloat(val) || 0);
                this.dispatchEvent('seeking');
                this.dispatchEvent('timeupdate');
            },
            get duration() {
                return dur;
            },
            set duration(val) {
                dur = Math.max(0, parseFloat(val) || 0);
                this.dispatchEvent('durationchange');
            },
            get paused() {
                return isPaused;
            },
            set paused(val) {
                isPaused = !!val;
            },
            get muted() {
                return isMuted;
            },
            set muted(val) {
                isMuted = !!val;
                this.dispatchEvent('volumechange');
            },
            get volume() {
                return vol;
            },
            set volume(val) {
                vol = Math.max(0, Math.min(1, parseFloat(val) || 0));
                this.dispatchEvent('volumechange');
            },
            get playbackRate() {
                return rate;
            },
            set playbackRate(val) {
                rate = parseFloat(val) || 1.0;
                this.dispatchEvent('ratechange');
            },
            get buffered() {
                const self = this;
                return {
                    length: 1,
                    start: function() { return 0; },
                    end: function() { return self.duration || 0; }
                };
            },
            play: function() {
                this.paused = false;
                this.dispatchEvent('play');
                return Promise.resolve();
            },
            pause: function() {
                this.paused = true;
                this.dispatchEvent('pause');
            },
            destroy: function() {}
        };
    }

    /**
     * YouTube Adapter using YouTube IFrame Player API.
     */
    function createYouTubeAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let ytPlayer = null;
        let updateTimer = null;

        let videoId = url;
        const match = /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/(?:embed\/|watch\?v=|\/)?([a-zA-Z0-9_-]{11})/i.exec(url);
        if (match && match[1]) {
            videoId = match[1];
        }

        const containerId = 'smartvideo_yt_' + Math.random().toString(36).substring(2, 9);
        mountEl.innerHTML = '<div id="' + containerId + '" class="w-100 h-100"></div>';

        function startTimer() {
            stopTimer();
            updateTimer = setInterval(function() {
                if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
                    adapter.dispatchEvent('timeupdate');
                }
            }, 250);
        }

        function stopTimer() {
            if (updateTimer) {
                clearInterval(updateTimer);
                updateTimer = null;
            }
        }

        function initYT() {
            ytPlayer = new window.YT.Player(containerId, {
                videoId: videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    rel: 0,
                    playsinline: 1,
                    disablekb: 0,
                    enablejsapi: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady: function(e) {
                        if (e.target && typeof e.target.getDuration === 'function') {
                            const d = e.target.getDuration();
                            if (d > 0) {
                                adapter.duration = d;
                            }
                        }
                        adapter.dispatchEvent('loadedmetadata');
                    },
                    onStateChange: function(e) {
                        if (e.data === window.YT.PlayerState.PLAYING) {
                            adapter.paused = false;
                            if (ytPlayer && typeof ytPlayer.getDuration === 'function') {
                                const d = ytPlayer.getDuration();
                                if (d > 0 && d !== adapter.duration) {
                                    adapter.duration = d;
                                }
                            }
                            startTimer();
                            adapter.dispatchEvent('play');
                        } else if (e.data === window.YT.PlayerState.PAUSED) {
                            adapter.paused = true;
                            stopTimer();
                            adapter.dispatchEvent('pause');
                        } else if (e.data === window.YT.PlayerState.ENDED) {
                            adapter.paused = true;
                            stopTimer();
                            adapter.dispatchEvent('ended');
                        }
                    },
                    onError: function(e) {
                        adapter.dispatchEvent('error', {error: e.data});
                    }
                }
            });
        }

        adapter.play = function() {
            if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
                ytPlayer.playVideo();
            }
            adapter.paused = false;
            return Promise.resolve();
        };

        adapter.pause = function() {
            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                ytPlayer.pauseVideo();
            }
            adapter.paused = true;
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
                    return ytPlayer.getCurrentTime();
                }
                return 0;
            },
            set: function(val) {
                if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
                    ytPlayer.seekTo(val, true);
                }
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        Object.defineProperty(adapter, 'muted', {
            get: function() {
                return ytPlayer && typeof ytPlayer.isMuted === 'function' ? ytPlayer.isMuted() : false;
            },
            set: function(val) {
                if (ytPlayer) {
                    val ? ytPlayer.mute() : ytPlayer.unMute();
                }
                adapter.dispatchEvent('volumechange');
            }
        });

        Object.defineProperty(adapter, 'volume', {
            get: function() {
                return ytPlayer && typeof ytPlayer.getVolume === 'function' ? (ytPlayer.getVolume() / 100) : 1;
            },
            set: function(val) {
                if (ytPlayer && typeof ytPlayer.setVolume === 'function') {
                    ytPlayer.setVolume(val * 100);
                }
                adapter.dispatchEvent('volumechange');
            }
        });

        Object.defineProperty(adapter, 'playbackRate', {
            get: function() {
                return ytPlayer && typeof ytPlayer.getPlaybackRate === 'function' ? ytPlayer.getPlaybackRate() : 1;
            },
            set: function(val) {
                if (ytPlayer && typeof ytPlayer.setPlaybackRate === 'function') {
                    ytPlayer.setPlaybackRate(val);
                }
                adapter.dispatchEvent('ratechange');
            }
        });

        adapter.destroy = function() {
            stopTimer();
            if (ytPlayer && typeof ytPlayer.destroy === 'function') {
                ytPlayer.destroy();
            }
        };

        if (window.YT && window.YT.Player) {
            initYT();
        } else {
            const prevReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function() {
                if (typeof prevReady === 'function') {
                    try { prevReady(); } catch (e) { /* ignore */ }
                }
                initYT();
            };
            loadExternalScript('https://www.youtube.com/iframe_api').then(function() {
                const checkInterval = setInterval(function() {
                    if (window.YT && window.YT.Player) {
                        clearInterval(checkInterval);
                        if (!ytPlayer) {
                            initYT();
                        }
                    }
                }, 100);
            });
        }

        return adapter;
    }

    /**
     * Vimeo Adapter using Vimeo Player SDK.
     */
    function createVimeoAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let vimeoPlayer = null;
        let vimeoCurrentTime = 0;

        let videoId = url;
        let hash = '';
        const match = /(?:vimeo\.com)\/(?:video\/|channels\/(?:\w+\/)?|groups\/[^/]*\/videos\/|album\/\d+\/video\/|)?(\d+)(?:\/([a-zA-Z0-9]+))?/i.exec(url);
        if (match && match[1]) {
            videoId = match[1];
            hash = match[2] || '';
        }
        if (!hash) {
            const hMatch = /[?&]h=([a-zA-Z0-9]+)/i.exec(url);
            if (hMatch && hMatch[1]) {
                hash = hMatch[1];
            }
        }

        let embedUrl = 'https://player.vimeo.com/video/' + videoId + '?dnt=1&playsinline=1';
        if (hash) {
            embedUrl += '&h=' + hash;
        }

        // Render direct iframe with strict-origin referrerpolicy to avoid oEmbed 403 blocks.
        mountEl.innerHTML = '<iframe src="' + embedUrl + '" class="w-100 h-100 border-0 position-absolute top-0 start-0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin" style="width: 100% !important; height: 100% !important; border: 0 !important;"></iframe>';
        const iframe = mountEl.querySelector('iframe');

        loadExternalScript('https://player.vimeo.com/api/player.js').then(function() {
            if (window.Vimeo && window.Vimeo.Player && iframe) {
                try {
                    vimeoPlayer = new window.Vimeo.Player(iframe);

                    const updateDuration = function() {
                        vimeoPlayer.getDuration().then(function(d) {
                            if (d > 0) {
                                adapter.duration = d;
                            }
                            adapter.dispatchEvent('loadedmetadata');
                        }).catch(function() {
                            adapter.dispatchEvent('loadedmetadata');
                        });
                    };

                    vimeoPlayer.ready().then(updateDuration).catch(function() {});
                    vimeoPlayer.on('loaded', updateDuration);

                    vimeoPlayer.on('play', function() {
                        adapter.paused = false;
                        adapter.dispatchEvent('play');
                    });

                    vimeoPlayer.on('pause', function() {
                        adapter.paused = true;
                        adapter.dispatchEvent('pause');
                    });

                    vimeoPlayer.on('ended', function() {
                        adapter.paused = true;
                        adapter.dispatchEvent('ended');
                    });

                    vimeoPlayer.on('timeupdate', function(data) {
                        vimeoCurrentTime = data ? data.seconds : 0;
                        adapter.dispatchEvent('timeupdate');
                    });

                    vimeoPlayer.on('seeked', function(data) {
                        vimeoCurrentTime = data ? data.seconds : 0;
                        adapter.dispatchEvent('seeking');
                        adapter.dispatchEvent('timeupdate');
                    });

                    vimeoPlayer.on('error', function(err) {
                        console.warn('[SmartVideo] Vimeo player error:', err);
                        adapter.dispatchEvent('error', {error: err});
                    });
                } catch (e) {
                    console.warn('[SmartVideo] Vimeo SDK attach error:', e);
                }
            }
        });

        adapter.play = function() {
            adapter.paused = false;
            if (vimeoPlayer && typeof vimeoPlayer.play === 'function') {
                return vimeoPlayer.play().catch(function() {});
            }
            return Promise.resolve();
        };

        adapter.pause = function() {
            adapter.paused = true;
            if (vimeoPlayer && typeof vimeoPlayer.pause === 'function') {
                vimeoPlayer.pause().catch(function() {});
            }
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                return vimeoCurrentTime;
            },
            set: function(val) {
                vimeoCurrentTime = val;
                if (vimeoPlayer && typeof vimeoPlayer.setCurrentTime === 'function') {
                    vimeoPlayer.setCurrentTime(val).catch(function() {});
                }
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        Object.defineProperty(adapter, 'playbackRate', {
            get: function() {
                return 1.0;
            },
            set: function(val) {
                if (vimeoPlayer && typeof vimeoPlayer.setPlaybackRate === 'function') {
                    vimeoPlayer.setPlaybackRate(val).catch(function() {});
                }
                adapter.dispatchEvent('ratechange');
            }
        });

        Object.defineProperty(adapter, 'muted', {
            get: function() {
                return false;
            },
            set: function(val) {
                if (vimeoPlayer && typeof vimeoPlayer.setMuted === 'function') {
                    vimeoPlayer.setMuted(!!val).catch(function() {});
                }
                adapter.dispatchEvent('volumechange');
            }
        });

        Object.defineProperty(adapter, 'volume', {
            get: function() {
                return 1.0;
            },
            set: function(val) {
                if (vimeoPlayer && typeof vimeoPlayer.setVolume === 'function') {
                    vimeoPlayer.setVolume(val).catch(function() {});
                }
                adapter.dispatchEvent('volumechange');
            }
        });

        adapter.destroy = function() {
            if (vimeoPlayer && typeof vimeoPlayer.destroy === 'function') {
                vimeoPlayer.destroy().catch(function() {});
            }
        };

        return adapter;
    }

    /**
     * Bunny Stream Adapter using PlayerJS.
     */
    function createBunnyStreamAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let playerjsPlayer = null;
        let bunnyCurrentTime = 0;

        let embedUrl = url.replace(/\/watch\//, '/embed/').replace(/\/play\//, '/embed/');
        if (embedUrl.indexOf('autoplay=') === -1) {
            embedUrl += (embedUrl.indexOf('?') === -1 ? '?' : '&') + 'autoplay=false';
        }

        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.className = 'w-100 h-100 border-0';
        iframe.allow = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;';
        iframe.allowFullscreen = true;
        mountEl.innerHTML = '';
        mountEl.appendChild(iframe);

        loadExternalScript('https://cdn.embed.ly/player-0.1.0.min.js').then(function() {
            playerjsPlayer = new window.playerjs.Player(iframe);

            playerjsPlayer.on('ready', function() {
                playerjsPlayer.getDuration(function(d) {
                    if (d > 0) {
                        adapter.duration = d;
                    }
                    adapter.dispatchEvent('loadedmetadata');
                });
            });

            playerjsPlayer.on('play', function() {
                adapter.paused = false;
                adapter.dispatchEvent('play');
            });

            playerjsPlayer.on('pause', function() {
                adapter.paused = true;
                adapter.dispatchEvent('pause');
            });

            playerjsPlayer.on('ended', function() {
                adapter.paused = true;
                adapter.dispatchEvent('ended');
            });

            playerjsPlayer.on('timeupdate', function(data) {
                bunnyCurrentTime = data.seconds;
                adapter.dispatchEvent('timeupdate');
            });
        });

        adapter.play = function() {
            adapter.paused = false;
            if (playerjsPlayer) {
                playerjsPlayer.play();
            }
            return Promise.resolve();
        };

        adapter.pause = function() {
            adapter.paused = true;
            if (playerjsPlayer) {
                playerjsPlayer.pause();
            }
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                return bunnyCurrentTime;
            },
            set: function(val) {
                bunnyCurrentTime = val;
                if (playerjsPlayer) {
                    playerjsPlayer.setCurrentTime(val);
                }
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        return adapter;
    }

    /**
     * VdoCipher Adapter using VdoPlayer V2 SDK.
     */
    function createVdoCipherAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let vdoPlayer = null;
        let vdoTime = 0;

        let videoId = url;
        const match = /vdocipher\.com\/dashboard\/video\/(?:embed\/|)([a-zA-Z0-9_-]+)/i.exec(url);
        if (match && match[1]) {
            videoId = match[1];
        }

        mountEl.innerHTML = '<div class="smartvideo-vdo-container w-100 h-100"></div>';
        const targetContainer = mountEl.querySelector('.smartvideo-vdo-container');

        const otpUrl = M.cfg.wwwroot + '/mod/smartvideo/ajax.php?action=get_vdocipher&sesskey=' +
            encodeURIComponent(M.cfg.sesskey) + '&videoid=' + encodeURIComponent(videoId) + '&info=otp';

        fetch(otpUrl).then(function(res) {
            return res.json();
        }).then(function(data) {
            if (!data || data.error || !data.otp) {
                console.error('[SmartVideo] VdoCipher OTP failed:', data);
                return;
            }

            loadExternalScript('https://player.vdocipher.com/v2/api.js').then(function() {
                const iframe = document.createElement('iframe');
                iframe.src = 'https://player.vdocipher.com/v2/?otp=' + encodeURIComponent(data.otp) + '&playbackInfo=' + encodeURIComponent(data.playbackInfo);
                iframe.className = 'w-100 h-100 border-0';
                iframe.allow = 'encrypted-media; autoplay';
                iframe.allowFullscreen = true;
                targetContainer.innerHTML = '';
                targetContainer.appendChild(iframe);

                if (window.VdoPlayer) {
                    vdoPlayer = window.VdoPlayer.getInstance(iframe);
                    if (vdoPlayer && vdoPlayer.video) {
                        vdoPlayer.video.addEventListener('play', function() {
                            adapter.paused = false;
                            adapter.dispatchEvent('play');
                        });
                        vdoPlayer.video.addEventListener('pause', function() {
                            adapter.paused = true;
                            adapter.dispatchEvent('pause');
                        });
                        vdoPlayer.video.addEventListener('ended', function() {
                            adapter.paused = true;
                            adapter.dispatchEvent('ended');
                        });
                        vdoPlayer.video.addEventListener('timeupdate', function() {
                            vdoTime = vdoPlayer.video.currentTime;
                            adapter.dispatchEvent('timeupdate');
                        });
                        vdoPlayer.video.addEventListener('loadedmetadata', function() {
                            adapter.duration = vdoPlayer.video.duration;
                            adapter.dispatchEvent('loadedmetadata');
                        });
                    }
                }
            });
        });

        adapter.play = function() {
            adapter.paused = false;
            if (vdoPlayer && vdoPlayer.video) {
                vdoPlayer.video.play();
            }
            return Promise.resolve();
        };

        adapter.pause = function() {
            adapter.paused = true;
            if (vdoPlayer && vdoPlayer.video) {
                vdoPlayer.video.pause();
            }
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                return vdoPlayer && vdoPlayer.video ? vdoPlayer.video.currentTime : vdoTime;
            },
            set: function(val) {
                vdoTime = val;
                if (vdoPlayer && vdoPlayer.video) {
                    vdoPlayer.video.currentTime = val;
                }
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        return adapter;
    }

    /**
     * Dailymotion Adapter using Dailymotion SDK.
     */
    function createDailymotionAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let dmPlayer = null;
        let dmTime = 0;

        let videoId = url;
        const match = /(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/?#]+)/i.exec(url);
        if (match && match[1]) {
            videoId = match[1];
        }

        const divId = 'smartvideo_dm_' + Math.random().toString(36).substring(2, 9);
        mountEl.innerHTML = '<div id="' + divId + '" class="w-100 h-100"></div>';

        loadExternalScript('https://geo.dailymotion.com/libs/player/xsyje.js').then(function() {
            const checkDm = setInterval(function() {
                if (window.dailymotion && window.dailymotion.createPlayer) {
                    clearInterval(checkDm);
                    window.dailymotion.createPlayer(divId, {
                        video: videoId,
                        params: {
                            controls: false,
                            mute: false
                        }
                    }).then(function(p) {
                        dmPlayer = p;
                        p.on('play', function() {
                            adapter.paused = false;
                            adapter.dispatchEvent('play');
                        });
                        p.on('pause', function() {
                            adapter.paused = true;
                            adapter.dispatchEvent('pause');
                        });
                        p.on('end', function() {
                            adapter.paused = true;
                            adapter.dispatchEvent('ended');
                        });
                        p.on('timeupdate', function(state) {
                            dmTime = state ? (state.videoTime || 0) : 0;
                            adapter.dispatchEvent('timeupdate');
                        });
                        if (typeof p.getState === 'function') {
                            p.getState().then(function(st) {
                                if (st && st.videoDuration) {
                                    adapter.duration = st.videoDuration;
                                    adapter.dispatchEvent('loadedmetadata');
                                }
                            });
                        }
                    });
                }
            }, 100);
        });

        adapter.play = function() {
            adapter.paused = false;
            if (dmPlayer && typeof dmPlayer.play === 'function') {
                dmPlayer.play();
            }
            return Promise.resolve();
        };

        adapter.pause = function() {
            adapter.paused = true;
            if (dmPlayer && typeof dmPlayer.pause === 'function') {
                dmPlayer.pause();
            }
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                return dmTime;
            },
            set: function(val) {
                dmTime = val;
                if (dmPlayer && typeof dmPlayer.seek === 'function') {
                    dmPlayer.seek(val);
                }
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        return adapter;
    }

    /**
     * Wistia Adapter using Wistia E-v1 JavaScript API.
     */
    function createWistiaAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let wistiaPlayer = null;
        let wistiaTime = 0;

        let videoId = url;
        const match = /(?:[^.]+\.)*wistia\.com\/medias\/([^/?#]+)/i.exec(url);
        if (match && match[1]) {
            videoId = match[1];
        }

        mountEl.innerHTML = '<div class="wistia_embed wistia_async_' + videoId + ' controlsVisibleOnLoad=false playButton=false" style="height:100%;width:100%"></div>';

        window._wq = window._wq || [];
        window._wq.push({
            id: videoId,
            onReady: function(video) {
                wistiaPlayer = video;
                adapter.duration = video.duration();
                adapter.dispatchEvent('loadedmetadata');

                video.bind('play', function() {
                    adapter.paused = false;
                    adapter.dispatchEvent('play');
                });
                video.bind('pause', function() {
                    adapter.paused = true;
                    adapter.dispatchEvent('pause');
                });
                video.bind('end', function() {
                    adapter.paused = true;
                    adapter.dispatchEvent('ended');
                });
                video.bind('secondchange', function(s) {
                    wistiaTime = s;
                    adapter.dispatchEvent('timeupdate');
                });
            }
        });

        loadExternalScript('https://fast.wistia.com/assets/external/E-v1.js');

        adapter.play = function() {
            adapter.paused = false;
            if (wistiaPlayer) {
                wistiaPlayer.play();
            }
            return Promise.resolve();
        };

        adapter.pause = function() {
            adapter.paused = true;
            if (wistiaPlayer) {
                wistiaPlayer.pause();
            }
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                return wistiaPlayer ? wistiaPlayer.time() : wistiaTime;
            },
            set: function(val) {
                wistiaTime = val;
                if (wistiaPlayer) {
                    wistiaPlayer.time(val);
                }
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        return adapter;
    }

    /**
     * ScreenPal Adapter using ScreenPal postMessage API.
     */
    function createScreenPalAdapter(mountEl, url, initialDuration) {
        const adapter = createBaseAdapter(mountEl, initialDuration);
        let spCurrentTime = 0;

        let videoId = (url || '').trim();
        const spRegex = /(?:go\.screenpal\.com|screencast-o-matic\.com)\/(?:player|watch|appearance)\/([a-zA-Z0-9]+)|(?:sp-embed-player["']?\s+data-id=["']([a-zA-Z0-9]+)["'])|(?:screenpal\.com\/player\/([a-zA-Z0-9]+))/i;
        const match = spRegex.exec(videoId);
        if (match && (match[1] || match[2] || match[3])) {
            videoId = match[1] || match[2] || match[3];
        }

        const embedUrl = 'https://go.screenpal.com/player/' + videoId + '?width=100%&height=100%&ff=1&title=0';

        mountEl.innerHTML = '<iframe src="' + embedUrl + '" class="w-100 h-100 border-0 position-absolute top-0 start-0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin" style="width: 100% !important; height: 100% !important; border: 0 !important;"></iframe>';
        const iframe = mountEl.querySelector('iframe');

        function sendCommand(cmd, data) {
            if (iframe && iframe.contentWindow) {
                const payload = Object.assign({ type: cmd }, data || {});
                iframe.contentWindow.postMessage(payload, '*');
            }
        }

        function onWindowMessage(event) {
            if (!event.data || typeof event.data !== 'object') {
                return;
            }

            const type = event.data.type;
            if (!type || typeof type !== 'string') {
                return;
            }

            // Verify message comes from ScreenPal player iframe.
            if (event.source !== (iframe ? iframe.contentWindow : null) &&
                (!event.origin || event.origin.indexOf('screenpal.com') === -1)) {
                return;
            }

            if (type === 'videoPlayerReady') {
                adapter.dispatchEvent('loadedmetadata');
            } else if (type === 'videoPlayerPlay' || type === 'videoPlayerPlaying') {
                adapter.paused = false;
                adapter.dispatchEvent('play');
            } else if (type === 'videoPlayerPause') {
                adapter.paused = true;
                adapter.dispatchEvent('pause');
            } else if (type === 'videoPlayerTimeUpdate') {
                if (typeof event.data.timestamp === 'number') {
                    spCurrentTime = event.data.timestamp;
                }
                adapter.dispatchEvent('timeupdate');
            } else if (type === 'videoPlayerSeeking') {
                adapter.dispatchEvent('seeking');
            } else if (type === 'videoPlayerSeeked') {
                adapter.dispatchEvent('seeked');
            } else if (type === 'videoPlayerEnded') {
                adapter.paused = true;
                adapter.dispatchEvent('ended');
            } else if (type === 'videoPlayerRateChange') {
                adapter.dispatchEvent('ratechange');
            }
        }

        window.addEventListener('message', onWindowMessage);

        adapter.play = function() {
            adapter.paused = false;
            sendCommand('playVideo');
            return Promise.resolve();
        };

        adapter.pause = function() {
            adapter.paused = true;
            sendCommand('pauseVideo');
        };

        Object.defineProperty(adapter, 'currentTime', {
            get: function() {
                return spCurrentTime;
            },
            set: function(val) {
                spCurrentTime = Math.max(0, parseFloat(val) || 0);
                sendCommand('setVideoTimestamp', { timestamp: spCurrentTime });
                adapter.dispatchEvent('seeking');
                adapter.dispatchEvent('timeupdate');
            }
        });

        Object.defineProperty(adapter, 'playbackRate', {
            get: function() {
                return 1.0;
            },
            set: function(val) {
                sendCommand('setVideoPlaybackRate', { playbackRate: parseFloat(val) || 1.0 });
                adapter.dispatchEvent('ratechange');
            }
        });

        Object.defineProperty(adapter, 'muted', {
            get: function() {
                return false;
            },
            set: function(val) {
                sendCommand(val ? 'muteVideo' : 'unmuteVideo');
                adapter.dispatchEvent('volumechange');
            }
        });

        Object.defineProperty(adapter, 'volume', {
            get: function() {
                return 1.0;
            },
            set: function() {
                adapter.dispatchEvent('volumechange');
            }
        });

        adapter.destroy = function() {
            window.removeEventListener('message', onWindowMessage);
            if (mountEl) {
                mountEl.innerHTML = '';
            }
        };

        return adapter;
    }

    /**
     * Main player controller instance.
     *
     * @param {HTMLElement} container
     */
    function SmartPlayer(container) {
        this.container = container;
        this.cmid = parseInt(container.dataset.cmid, 10);
        this.playlistUrl = container.dataset.playlisturl;
        this.duration = parseFloat(container.dataset.duration) || 0;
        this.lastPosition = parseFloat(container.dataset.lastposition) || 0;
        this.maxPosition = parseFloat(container.dataset.maxposition) || 0;
        this.watchedSeconds = parseInt(container.dataset.watchedseconds, 10) || 0;
        this.completionMinPercent = parseInt(container.dataset.completionminpercent, 10) || 0;
        this.preventSeeking = container.dataset.preventseeking === '1';
        this.watermarkEnabled = container.dataset.watermarkenabled === '1';
        this.watermarkOpacity = parseFloat(container.dataset.watermarkopacity) || 0.35;

        this.studentName = container.dataset.studentname || '';
        this.studentId = container.dataset.studentid || '';
        this.studentIp = container.dataset.studentip || '';
        this.liveTime = container.dataset.livetime || '';

        let rawIntervals = container.dataset.watchedintervals || '[]';
        try {
            if (rawIntervals.indexOf('&quot;') !== -1 || rawIntervals.indexOf('&amp;') !== -1) {
                const txt = document.createElement('textarea');
                txt.innerHTML = rawIntervals;
                rawIntervals = txt.value;
            }
            this.watchedIntervals = JSON.parse(rawIntervals);
            if (!Array.isArray(this.watchedIntervals)) {
                this.watchedIntervals = [];
            }
        } catch (e) {
            this.watchedIntervals = [];
        }

        let rawQuestions = container.dataset.questions || '[]';
        try {
            if (rawQuestions.indexOf('&quot;') !== -1 || rawQuestions.indexOf('&amp;') !== -1) {
                const txt = document.createElement('textarea');
                txt.innerHTML = rawQuestions;
                rawQuestions = txt.value;
            }
            this.questions = JSON.parse(rawQuestions);
            if (!Array.isArray(this.questions)) {
                this.questions = [];
            }
        } catch (e) {
            console.error('[SmartVideo] Failed to parse questions JSON:', e, rawQuestions);
            this.questions = [];
        }

        this.questions.sort(function(a, b) {
            return (a.timecode || 0) - (b.timecode || 0);
        });

        // Parse chapters.
        let rawChapters = container.dataset.chapters || '[]';
        try {
            if (rawChapters.indexOf('&quot;') !== -1 || rawChapters.indexOf('&amp;') !== -1) {
                const txt = document.createElement('textarea');
                txt.innerHTML = rawChapters;
                rawChapters = txt.value;
            }
            this.chapters = JSON.parse(rawChapters);
            if (!Array.isArray(this.chapters)) {
                this.chapters = [];
            }
        } catch (e) {
            this.chapters = [];
        }
        this.chapters.sort(function(a, b) {
            return (a.timecode || 0) - (b.timecode || 0);
        });
        this.cachedSegments = [];

        // Parse in-video callouts.
        let rawCallouts = container.dataset.callouts || '[]';
        try {
            if (rawCallouts.indexOf('&quot;') !== -1 || rawCallouts.indexOf('&amp;') !== -1) {
                const txt = document.createElement('textarea');
                txt.innerHTML = rawCallouts;
                rawCallouts = txt.value;
            }
            this.callouts = JSON.parse(rawCallouts);
            if (!Array.isArray(this.callouts)) {
                this.callouts = [];
            }
        } catch (e) {
            this.callouts = [];
        }
        this.activeCallout = null;
        this.calloutTimer = null;

        // Parse subtitle cues.
        let rawCues = container.dataset.cues || '[]';
        try {
            if (rawCues.indexOf('&quot;') !== -1 || rawCues.indexOf('&amp;') !== -1) {
                const txt = document.createElement('textarea');
                txt.innerHTML = rawCues;
                rawCues = txt.value;
            }
            this.cues = JSON.parse(rawCues);
            if (!Array.isArray(this.cues)) {
                this.cues = [];
            }
        } catch (e) {
            this.cues = [];
        }

        // Parse subtitle tracks.
        let rawTracks = container.dataset.tracks || '[]';
        try {
            if (rawTracks.indexOf('&quot;') !== -1 || rawTracks.indexOf('&amp;') !== -1) {
                const txt = document.createElement('textarea');
                txt.innerHTML = rawTracks;
                rawTracks = txt.value;
            }
            this.tracks = JSON.parse(rawTracks);
            if (!Array.isArray(this.tracks)) {
                this.tracks = [];
            }
        } catch (e) {
            this.tracks = [];
        }

        this.captionsOverlay = container.querySelector('#smartVideoCaptionsOverlay');
        this.captionText = container.querySelector('.smartvideo-caption-text');
        this.captionsEnabled = false;
        this.activeTrackId = (this.tracks.length > 0) ? this.tracks[0].id : -1;
        this.transcriptUserHovering = false;

        this.videoType = container.dataset.videotype || 'securelibrary';
        this.externalMount = container.querySelector('#smartVideoExternalMount');
        this.clickShield = container.querySelector('#smartVideoClickShield');
        const rawVideo = container.querySelector('#smartVideoElement, #secureVideoElement, video');

        if (this.videoType !== 'securelibrary' && this.videoType !== 'html5video') {
            if (rawVideo) {
                rawVideo.style.display = 'none';
            }
            if (this.externalMount) {
                this.externalMount.classList.remove('d-none');
                this.externalMount.style.display = 'block';
                this.externalMount.style.zIndex = '5';
            }
            if (this.videoType === 'youtube') {
                this.video = createYouTubeAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else if (this.videoType === 'vimeo') {
                this.video = createVimeoAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else if (this.videoType === 'bunnystream') {
                this.video = createBunnyStreamAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else if (this.videoType === 'vdocipher') {
                this.video = createVdoCipherAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else if (this.videoType === 'dailymotion') {
                this.video = createDailymotionAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else if (this.videoType === 'wistia') {
                this.video = createWistiaAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else if (this.videoType === 'screenpal') {
                this.video = createScreenPalAdapter(this.externalMount, this.playlistUrl, this.duration);
            } else {
                this.video = rawVideo;
            }
        } else {
            this.video = rawVideo;
        }

        this.canvas = container.querySelector('#smartVideoWatermarkCanvas, #secureVideoWatermarkCanvas, canvas');
        this.questionOverlay = container.querySelector('#smartVideoQuestionOverlay, #secureVideoQuestionOverlay');
        this.calloutOverlay = container.querySelector('#smartVideoCalloutOverlay');
        this.activeQuestion = null;
        this.hls = null;
        this.beaconInterval = null;
        this.watermarkInterval = null;
        this.isScrubbing = false;

        this.init();
    }

    SmartPlayer.prototype = {
        /**
         * Initialize player.
         */
        init: function() {
            this.setupControls();
            this.setupWatermark();
            this.setupAntiTamper();
            this.setupProgressBeacon();
            this.setupQuestions();
            this.setupChapters();
            this.setupCallouts();
            this.setupWorkstationSidebar();
            this.setupNotes();
            this.setupCalculator();
            this.setupReport();
            this.setupCaptions();
            this.setupTranscript();
            this.setupDiscussions();
            this.loadStream();
        },

        /**
         * Load HLS Stream into video element.
         */
        loadStream: function() {
            const self = this;
            const video = this.video;

            if (this.videoType !== 'securelibrary' && this.videoType !== 'html5video') {
                return;
            }

            if (this.videoType === 'html5video') {
                if (this.playlistUrl && this.playlistUrl.indexOf('.m3u8') === -1) {
                    video.src = this.playlistUrl;
                    video.addEventListener('error', function() {
                        self.showStreamError('Direct video playback error: Stream could not be loaded.');
                    });
                    return;
                }
            }

            loadHls().then(function(Hls) {
                if (Hls.isSupported()) {
                    self.hls = new Hls({
                        debug: false,
                        enableWorker: true,
                        xhrSetup: function(xhr, url) {
                            xhr.withCredentials = true;
                            if (url && url.indexOf('key.php') !== -1) {
                                try {
                                    const urlObj = new URL(url, window.location.href);
                                    const token = urlObj.searchParams.get('token');
                                    if (token) {
                                        xhr.setRequestHeader('X-Moodle-Player-Token', token);
                                    }
                                } catch (e) {
                                    const match = /[?&]token=([a-fA-F0-9]+)/.exec(url);
                                    if (match) {
                                        xhr.setRequestHeader('X-Moodle-Player-Token', match[1]);
                                    }
                                }
                                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                            }
                        }
                    });

                    self.hls.loadSource(self.playlistUrl);
                    self.hls.attachMedia(video);

                    self.hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
                        self.setupQualityLevels(data.levels);
                    });

                    self.hls.on(Hls.Events.ERROR, function(event, data) {
                        if (data && data.fatal) {
                            console.error('[SmartVideo] Fatal stream error:', data);
                            let msg = 'Playback error: Unable to load video stream.';
                            if (data.response && data.response.code === 403) {
                                msg = 'Access denied: You do not have permission to stream this video.';
                            } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                                msg = 'Network error: Failed to reach video streaming server.';
                            }
                            self.showStreamError(msg);
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = self.playlistUrl;
                    video.addEventListener('error', function() {
                        self.showStreamError('Native video playback error: Stream could not be loaded.');
                    });
                }
            }).catch(Notification.exception);
        },

        /**
         * Render a visible stream error notice over the video stage.
         *
         * @param {string} msg
         */
        showStreamError: function(msg) {
            const container = this.container;
            let errEl = container.querySelector('.smartvideo-stream-error');
            if (!errEl) {
                errEl = document.createElement('div');
                errEl.className = 'smartvideo-stream-error position-absolute top-50 start-50 translate-middle bg-dark bg-opacity-95 text-white p-3 rounded shadow-lg text-center border border-danger';
                errEl.style.zIndex = '35';
                errEl.style.maxWidth = '85%';
                const stage = container.querySelector('.smartvideo-stage-ratio') || container;
                stage.appendChild(errEl);
            }
            errEl.innerHTML = '<i class="fa fa-exclamation-triangle fa-2x text-warning mb-2 d-block"></i><div class="fw-bold mb-1">' +
                msg + '</div><button type="button" class="btn btn-sm btn-outline-light mt-2" onclick="location.reload();"><i class="fa fa-refresh me-1"></i> Retry</button>';
        },

        /**
         * Setup custom UI controls.
         */
        setupControls: function() {
            const self = this;
            const video = this.video;
            const container = this.container;

            const playBtn = container.querySelector('.smartvideo-btn-play, .securevideo-btn-play');
            const bigPlayBtn = container.querySelector('.smartvideo-btn-bigplay, .securevideo-btn-bigplay');
            const centerOverlay = container.querySelector('.smartvideo-center-overlay, .securevideo-center-overlay');
            const muteBtn = container.querySelector('.smartvideo-btn-mute, .securevideo-btn-mute');
            const volumeSlider = container.querySelector('.smartvideo-volume-slider, .securevideo-volume-slider');
            const timelineWrapper = container.querySelector('.smartvideo-timeline-wrapper, .securevideo-timeline-wrapper');
            const progressBar = container.querySelector('.smartvideo-progress-bar, .securevideo-progress-bar');
            const bufferedBar = container.querySelector('.smartvideo-buffered-bar, .securevideo-buffered-bar');
            const maxMarker = container.querySelector('.smartvideo-max-marker, .securevideo-max-marker');
            const currentTimeEl = container.querySelector('.smartvideo-current-time, .securevideo-current-time');
            const fullscreenBtn = container.querySelector('.smartvideo-btn-fullscreen, .securevideo-btn-fullscreen');
            const speedItems = container.querySelectorAll('.smartvideo-speed-menu button, .securevideo-speed-menu button');
            const resumeToast = container.querySelector('#smartVideoResumeToast, #secureVideoResumeToast');
            const seekNotice = container.querySelector('#smartVideoSeekNotice, #secureVideoSeekNotice');

            // Play / Pause toggle function.
            const togglePlay = function() {
                if (self.activeQuestion) {
                    return; // Prevent play while question overlay is active.
                }
                if (video.paused || video.ended) {
                    video.play().catch(function(err) {
                        console.warn('[SmartVideo] Autoplay blocked:', err);
                    });
                } else {
                    video.pause();
                }
            };

            if (playBtn) {
                playBtn.addEventListener('click', togglePlay);
            }
            if (bigPlayBtn) {
                bigPlayBtn.addEventListener('click', togglePlay);
            }
            if (centerOverlay) {
                centerOverlay.addEventListener('click', function(e) {
                    if (bigPlayBtn && bigPlayBtn.contains(e.target)) {
                        return; // bigPlayBtn click listener already handles it.
                    }
                    togglePlay();
                });
            }
            // If YouTube, Vimeo, or ScreenPal provider:
            // 1. Never obscure or hide player features, branding, or native player controls.
            // 2. Allow user clicks and touch events to pass directly to video player (pointer-events: none on clickShield).
            // 3. Hide center big play overlay as native controls and play state are used.
            if (self.videoType === 'youtube' || self.videoType === 'vimeo' || self.videoType === 'screenpal') {
                if (self.clickShield) {
                    self.clickShield.style.pointerEvents = 'none';
                    self.clickShield.classList.add('pe-none', 'd-none');
                }
                if (centerOverlay) {
                    centerOverlay.classList.add('d-none');
                    centerOverlay.style.pointerEvents = 'none';
                }
            } else {
                if (self.clickShield) {
                    self.clickShield.addEventListener('click', function() {
                        togglePlay();
                    });
                    self.clickShield.addEventListener('dblclick', function() {
                        toggleFullscreen();
                    });
                } else if (video && typeof video.addEventListener === 'function') {
                    video.addEventListener('click', function(e) {
                        if (e.target === video) {
                            togglePlay();
                        }
                    });
                    video.addEventListener('dblclick', function(e) {
                        if (e.target === video) {
                            toggleFullscreen();
                        }
                    });
                }
            }

            // Initial pause state.
            if (video && video.paused) {
                container.classList.add('is-paused');
            } else {
                container.classList.remove('is-paused');
            }

            // Sync play state UI.
            video.addEventListener('play', function() {
                container.classList.add('is-playing');
                container.classList.remove('is-paused');
                if (playBtn) {
                    playBtn.innerHTML = '<i class="fa fa-pause" aria-hidden="true"></i>';
                }
            });

            video.addEventListener('pause', function() {
                container.classList.remove('is-playing');
                container.classList.add('is-paused');
                if (playBtn) {
                    playBtn.innerHTML = '<i class="fa fa-play" aria-hidden="true"></i>';
                }
            });

            // Volume & Mute.
            if (muteBtn && volumeSlider) {
                muteBtn.addEventListener('click', function() {
                    video.muted = !video.muted;
                    muteBtn.innerHTML = video.muted ?
                        '<i class="fa fa-volume-off" aria-hidden="true"></i>' :
                        '<i class="fa fa-volume-up" aria-hidden="true"></i>';
                });

                volumeSlider.addEventListener('input', function(e) {
                    video.volume = parseFloat(e.target.value);
                    video.muted = (video.volume === 0);
                    muteBtn.innerHTML = video.muted ?
                        '<i class="fa fa-volume-off" aria-hidden="true"></i>' :
                        '<i class="fa fa-volume-up" aria-hidden="true"></i>';
                });
            }

            // Timeline scrubbing.
            const handleTimelineSeek = function(e) {
                if (self.activeQuestion) {
                    return;
                }
                const rect = timelineWrapper.getBoundingClientRect();
                const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const targetTime = (clickX / rect.width) * (video.duration || self.duration);

                // Check gate: First unpassed required question.
                const unpassedQ = self.findFirstUnpassedQuestion(targetTime);
                if (unpassedQ && targetTime > unpassedQ.timecode) {
                    video.currentTime = unpassedQ.timecode;
                    self.triggerQuestion(unpassedQ, false);
                    return;
                }

                // Anti-seek check.
                if (self.preventSeeking && targetTime > (self.maxPosition + 2)) {
                    video.currentTime = self.maxPosition;
                    if (seekNotice) {
                        seekNotice.classList.remove('d-none');
                        setTimeout(function() {
                            seekNotice.classList.add('d-none');
                        }, 2000);
                    }
                    return;
                }

                video.currentTime = targetTime;
            };

            if (timelineWrapper) {
                timelineWrapper.addEventListener('click', handleTimelineSeek);

                const hoverTooltip = container.querySelector('#smartVideoHoverTooltip');
                const hoverTime = hoverTooltip ? hoverTooltip.querySelector('.smartvideo-hover-time') : null;
                const hoverChapter = hoverTooltip ? hoverTooltip.querySelector('.smartvideo-hover-chapter-name') : null;

                timelineWrapper.addEventListener('mousemove', function(e) {
                    if (!hoverTooltip) {
                        return;
                    }
                    const rect = timelineWrapper.getBoundingClientRect();
                    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                    const dur = video.duration || self.duration;
                    const hoverSec = dur > 0 ? (clickX / rect.width) * dur : 0;

                    // Clamped position so tooltip stays within the container boundaries
                    const tipWidth = hoverTooltip.offsetWidth || 100;
                    const halfTip = tipWidth / 2;
                    const clampedX = Math.max(halfTip + 4, Math.min(clickX, rect.width - halfTip - 4));
                    hoverTooltip.style.left = clampedX + 'px';
                    hoverTooltip.classList.remove('d-none');

                    if (hoverTime) {
                        hoverTime.textContent = formatTime(hoverSec);
                    }

                    const chap = self.getChapterForTime(hoverSec);
                    if (chap && chap.title && hoverChapter) {
                        hoverChapter.textContent = chap.title;
                        hoverChapter.classList.remove('d-none');
                    } else if (hoverChapter) {
                        hoverChapter.classList.add('d-none');
                    }
                });

                timelineWrapper.addEventListener('mouseleave', function() {
                    if (hoverTooltip) {
                        hoverTooltip.classList.add('d-none');
                    }
                });
            }

            // Seeking guard against native or script seek bypasses.
            video.addEventListener('seeking', function() {
                if (self.activeQuestion) {
                    return;
                }
                const cur = video.currentTime;
                // Reset triggered flag for questions and callouts ahead of current seek target.
                self.questions.forEach(function(q) {
                    if (cur < q.timecode - 1) {
                        q.triggered = false;
                    }
                });
                self.callouts.forEach(function(c) {
                    if (cur < c.timecode - 1) {
                        c.triggered = false;
                    }
                });
                const unpassedQ = self.findFirstUnpassedQuestion(cur);
                if (unpassedQ && cur > unpassedQ.timecode) {
                    video.currentTime = unpassedQ.timecode;
                    self.triggerQuestion(unpassedQ, false);
                }
            });

            // End-of-video listener to ensure questions placed at the exact video duration still trigger.
            video.addEventListener('ended', function() {
                if (self.activeQuestion) {
                    return;
                }
                const dur = video.duration || self.duration;
                self.checkQuestionCuepoints(Math.max(video.currentTime, dur));
            });

            // Timeupdate listener.
            video.addEventListener('timeupdate', function() {
                const cur = video.currentTime;
                const dur = video.duration || self.duration;

                // Check interactive question cuepoints.
                self.checkQuestionCuepoints(cur);

                // Update active chapter and in-video callouts.
                self.updateActiveChapter(cur);
                self.checkCallouts(cur);
                self.updateCaptions(cur);
                self.syncTranscript(cur);

                // Anti-seek enforcement.
                if (self.preventSeeking) {
                    if (cur > self.maxPosition + 2) {
                        video.currentTime = self.maxPosition;
                        if (seekNotice) {
                            seekNotice.classList.remove('d-none');
                            setTimeout(function() {
                                seekNotice.classList.add('d-none');
                            }, 2000);
                        }
                    } else if (cur > self.maxPosition) {
                        self.maxPosition = cur;
                    }
                } else if (cur > self.maxPosition) {
                    self.maxPosition = cur;
                }

                // Interval tracking for legitimate watch time.
                if (!video.paused && cur > 0) {
                    const sec = Math.floor(cur);
                    self.watchedIntervals.push([sec, sec + 1]);
                }

                // Update timeline progress bar and YouTube-style scrubber thumb.
                if (dur > 0) {
                    const percent = (cur / dur) * 100;
                    if (progressBar) {
                        progressBar.style.width = percent + '%';
                    }
                    if (maxMarker && self.preventSeeking) {
                        maxMarker.style.left = ((self.maxPosition / dur) * 100) + '%';
                    }
                    const scrubberThumb = container.querySelector('.smartvideo-scrubber-thumb');
                    if (scrubberThumb) {
                        scrubberThumb.style.left = percent + '%';
                    }
                }

                // Update buffered progress.
                let bufferedEnd = 0;
                if (video.buffered.length > 0 && dur > 0) {
                    bufferedEnd = video.buffered.end(video.buffered.length - 1);
                    if (bufferedBar) {
                        bufferedBar.style.width = ((bufferedEnd / dur) * 100) + '%';
                    }
                }

                // Update YouTube-style discrete chapter segments.
                if (self.cachedSegments && self.cachedSegments.length > 0) {
                    for (let i = 0; i < self.cachedSegments.length; i++) {
                        const seg = self.cachedSegments[i];
                        // Progress fill:
                        let pWidth = 0;
                        if (cur >= seg.end) {
                            pWidth = 100;
                        } else if (cur <= seg.start) {
                            pWidth = 0;
                        } else if (seg.duration > 0) {
                            pWidth = Math.min(100, Math.max(0, ((cur - seg.start) / seg.duration) * 100));
                        }
                        if (seg.progWidth !== pWidth) {
                            seg.progEl.style.width = pWidth + '%';
                            seg.progWidth = pWidth;
                        }

                        // Buffer fill:
                        let bWidth = 0;
                        if (bufferedEnd >= seg.end) {
                            bWidth = 100;
                        } else if (bufferedEnd <= seg.start) {
                            bWidth = 0;
                        } else if (seg.duration > 0) {
                            bWidth = Math.min(100, Math.max(0, ((bufferedEnd - seg.start) / seg.duration) * 100));
                        }
                        if (seg.bufWidth !== bWidth) {
                            seg.bufEl.style.width = bWidth + '%';
                            seg.bufWidth = bWidth;
                        }
                    }
                }

                // Update time counter.
                if (currentTimeEl) {
                    currentTimeEl.textContent = formatTime(cur);
                }
            });

            // Playback speed selection.
            const speedBtn = container.querySelector('.smartvideo-btn-speed, .securevideo-btn-speed');
            const speedMenu = container.querySelector('.smartvideo-speed-menu, .securevideo-speed-menu');
            if (speedBtn && speedMenu) {
                speedBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const willShow = !speedMenu.classList.contains('show');
                    container.querySelectorAll('.smartvideo-controls-bar .dropdown-menu.show').forEach(function(m) {
                        m.classList.remove('show');
                    });
                    container.querySelectorAll('.smartvideo-controls-bar [aria-expanded="true"]').forEach(function(b) {
                        b.setAttribute('aria-expanded', 'false');
                    });
                    if (willShow) {
                        speedMenu.classList.add('show');
                        speedBtn.setAttribute('aria-expanded', 'true');
                    }
                });

                speedMenu.addEventListener('click', function(e) {
                    if (!e.target.closest('.dropdown-item')) {
                        e.stopPropagation();
                    }
                });
            }

            speedItems.forEach(function(item) {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const speed = parseFloat(item.dataset.speed);
                    if (!isNaN(speed) && isFinite(speed) && speed > 0) {
                        video.playbackRate = speed;
                    }
                    speedItems.forEach(function(b) {
                        b.classList.remove('active');
                    });
                    item.classList.add('active');
                    const label = container.querySelector('.smartvideo-current-speed, .securevideo-current-speed');
                    if (label) {
                        label.textContent = item.textContent.trim().split(' ')[0];
                    }
                    if (speedMenu) {
                        speedMenu.classList.remove('show');
                    }
                    if (speedBtn) {
                        speedBtn.setAttribute('aria-expanded', 'false');
                    }
                });
            });

            // Close dropdown menus when clicking elsewhere.
            document.addEventListener('click', function() {
                container.querySelectorAll('.smartvideo-controls-bar .dropdown-menu.show').forEach(function(m) {
                    m.classList.remove('show');
                });
                container.querySelectorAll('.smartvideo-controls-bar [aria-expanded="true"]').forEach(function(b) {
                    b.setAttribute('aria-expanded', 'false');
                });
            });

            // Fullscreen toggle function supporting standard and vendor prefixes.
            const toggleFullscreen = function() {
                const isFullscreen = !!(document.fullscreenElement ||
                    document.webkitFullscreenElement ||
                    document.mozFullScreenElement ||
                    document.msFullscreenElement);

                if (!isFullscreen) {
                    if (container.requestFullscreen) {
                        container.requestFullscreen();
                    } else if (container.webkitRequestFullscreen) {
                        container.webkitRequestFullscreen();
                    } else if (container.mozRequestFullScreen) {
                        container.mozRequestFullScreen();
                    } else if (container.msRequestFullscreen) {
                        container.msRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    } else if (document.mozCancelFullScreen) {
                        document.mozCancelFullScreen();
                    } else if (document.msExitFullscreen) {
                        document.msExitFullscreen();
                    }
                }
            };

            if (fullscreenBtn) {
                fullscreenBtn.addEventListener('click', toggleFullscreen);
            }

            // Keep fullscreen state and button icon synchronized (handles Esc, F11, etc.).
            const handleFullscreenChange = function() {
                const isFullscreen = !!(document.fullscreenElement ||
                    document.webkitFullscreenElement ||
                    document.mozFullScreenElement ||
                    document.msFullscreenElement);

                if (isFullscreen) {
                    container.classList.add('is-fullscreen');
                    container.classList.remove('is-idle');
                    if (fullscreenBtn) {
                        fullscreenBtn.innerHTML = '<i class="fa fa-compress" aria-hidden="true"></i>';
                        fullscreenBtn.setAttribute('title', 'Exit Fullscreen');
                    }
                } else {
                    container.classList.remove('is-fullscreen');
                    container.classList.remove('is-idle');
                    if (fullscreenBtn) {
                        fullscreenBtn.innerHTML = '<i class="fa fa-expand" aria-hidden="true"></i>';
                        fullscreenBtn.setAttribute('title', 'Fullscreen');
                    }
                }

                if (self.canvas && typeof self.resizeCanvas === 'function') {
                    setTimeout(function() {
                        self.resizeCanvas();
                    }, 60);
                }
            };

            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.addEventListener('mozfullscreenchange', handleFullscreenChange);
            document.addEventListener('MSFullscreenChange', handleFullscreenChange);

            // Resume bookmark actions.
            if (resumeToast) {
                const resumeBtn = resumeToast.querySelector('.btn-action-resume');
                const dismissBtn = resumeToast.querySelector('.btn-action-dismiss');

                if (resumeBtn) {
                    resumeBtn.addEventListener('click', function() {
                        let resumeTarget = self.lastPosition;
                        const unpassedQ = self.findFirstUnpassedQuestion(resumeTarget);
                        if (unpassedQ && resumeTarget > unpassedQ.timecode) {
                            resumeTarget = unpassedQ.timecode;
                        }
                        video.currentTime = resumeTarget;
                        resumeToast.remove();
                        video.play();
                    });
                }
                if (dismissBtn) {
                    dismissBtn.addEventListener('click', function() {
                        resumeToast.remove();
                    });
                }
            }

            // Auto-hide controls when idle (with controls hover preservation).
            let idleTimeout;
            let isOverControls = false;
            const controlsBar = container.querySelector('.smartvideo-controls-bar, .securevideo-controls-bar');

            const resetIdle = function() {
                container.classList.remove('is-idle');
                clearTimeout(idleTimeout);
                if (!video.paused && !isOverControls) {
                    idleTimeout = setTimeout(function() {
                        if (!isOverControls) {
                            container.classList.add('is-idle');
                        }
                    }, 3000);
                }
            };

            if (controlsBar) {
                controlsBar.addEventListener('mouseenter', function() {
                    isOverControls = true;
                    container.classList.remove('is-idle');
                    clearTimeout(idleTimeout);
                });
                controlsBar.addEventListener('mouseleave', function() {
                    isOverControls = false;
                    resetIdle();
                });
            }

            const sidebarEl = container.querySelector('.smartvideo-sidebar');
            if (sidebarEl) {
                sidebarEl.addEventListener('mouseenter', function() {
                    isOverControls = true;
                    container.classList.remove('is-idle');
                    clearTimeout(idleTimeout);
                });
                sidebarEl.addEventListener('mouseleave', function() {
                    isOverControls = false;
                    resetIdle();
                });
            }

            container.addEventListener('mousemove', resetIdle);
            container.addEventListener('click', resetIdle);
            container.addEventListener('touchstart', resetIdle, {passive: true});

            document.addEventListener('mousemove', function() {
                const isFs = !!(document.fullscreenElement === container ||
                    document.webkitFullscreenElement === container ||
                    document.mozFullScreenElement === container ||
                    document.msFullscreenElement === container);
                if (isFs) {
                    resetIdle();
                }
            });

            // Keyboard hotkeys for player container.
            container.addEventListener('keydown', function(e) {
                const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                    return;
                }
                if (self.activeQuestion) {
                    return;
                }

                if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    togglePlay();
                } else if (e.key === 'f' || e.key === 'F') {
                    e.preventDefault();
                    toggleFullscreen();
                } else if (e.key === 'm' || e.key === 'M') {
                    e.preventDefault();
                    video.muted = !video.muted;
                    if (muteBtn) {
                        muteBtn.innerHTML = video.muted ?
                            '<i class="fa fa-volume-off" aria-hidden="true"></i>' :
                            '<i class="fa fa-volume-up" aria-hidden="true"></i>';
                    }
                } else if (e.key === 'ArrowRight') {
                    const dur = video.duration || self.duration;
                    const target = Math.min(dur, video.currentTime + 5);
                    if (!self.preventSeeking || target <= self.maxPosition + 2) {
                        video.currentTime = target;
                    }
                } else if (e.key === 'ArrowLeft') {
                    video.currentTime = Math.max(0, video.currentTime - 5);
                }
            });
        },

        /**
         * Setup ABR Quality level options.
         *
         * @param {Array} levels
         */
        setupQualityLevels: function(levels) {
            const self = this;
            const container = this.container;
            const qualityContainer = container.querySelector('.smartvideo-quality-container, .securevideo-quality-container');
            const qualityMenu = container.querySelector('.smartvideo-quality-menu, .securevideo-quality-menu');
            const qualityLabel = container.querySelector('.smartvideo-current-quality, .securevideo-current-quality');

            if (!levels || levels.length <= 1 || !qualityContainer || !qualityMenu) {
                return;
            }

            qualityContainer.classList.remove('d-none');

            const qualityBtn = container.querySelector('.smartvideo-btn-quality, .securevideo-btn-quality');
            if (qualityBtn) {
                qualityBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const willShow = !qualityMenu.classList.contains('show');
                    container.querySelectorAll('.smartvideo-controls-bar .dropdown-menu.show').forEach(function(m) {
                        m.classList.remove('show');
                    });
                    container.querySelectorAll('.smartvideo-controls-bar [aria-expanded="true"]').forEach(function(b) {
                        b.setAttribute('aria-expanded', 'false');
                    });
                    if (willShow) {
                        qualityMenu.classList.add('show');
                        qualityBtn.setAttribute('aria-expanded', 'true');
                    }
                });

                qualityMenu.addEventListener('click', function(e) {
                    if (!e.target.closest('.dropdown-item')) {
                        e.stopPropagation();
                    }
                });
            }

            levels.forEach(function(level, idx) {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dropdown-item';
                btn.dataset.level = idx;
                btn.textContent = (level.height ? level.height + 'p' : 'Level ' + (idx + 1));

                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.hls.currentLevel = idx;
                    qualityMenu.querySelectorAll('.dropdown-item').forEach(function(b) {
                        b.classList.remove('active');
                    });
                    btn.classList.add('active');
                    if (qualityLabel) {
                        qualityLabel.textContent = btn.textContent;
                    }
                    qualityMenu.classList.remove('show');
                    if (qualityBtn) {
                        qualityBtn.setAttribute('aria-expanded', 'false');
                    }
                });

                li.appendChild(btn);
                qualityMenu.appendChild(li);
            });

            // Auto button.
            const autoBtn = qualityMenu.querySelector('[data-level="-1"]');
            if (autoBtn) {
                autoBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.hls.currentLevel = -1;
                    qualityMenu.querySelectorAll('.dropdown-item').forEach(function(b) {
                        b.classList.remove('active');
                    });
                    autoBtn.classList.add('active');
                    if (qualityLabel) {
                        qualityLabel.textContent = 'Auto';
                    }
                    qualityMenu.classList.remove('show');
                    if (qualityBtn) {
                        qualityBtn.setAttribute('aria-expanded', 'false');
                    }
                });
            }
        },

        /**
         * Setup dynamic canvas moving watermark.
         */
        setupWatermark: function() {
            if (!this.watermarkEnabled || !this.canvas) {
                return;
            }

            const canvas = this.canvas;
            const ctx = canvas.getContext('2d');
            const self = this;

            const resizeCanvas = function() {
                canvas.width = canvas.parentElement.clientWidth || 1280;
                canvas.height = canvas.parentElement.clientHeight || 720;
            };

            self.resizeCanvas = resizeCanvas;
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);

            // Watermark position state.
            let x = Math.random() * (canvas.width - 200);
            let y = Math.random() * (canvas.height - 100);
            let dx = (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.5);
            let dy = (Math.random() > 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.5);

            const drawWatermark = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                ctx.save();
                ctx.globalAlpha = self.watermarkOpacity;
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 4;
                ctx.font = 'bold 14px sans-serif';

                // Move coordinates.
                x += dx;
                y += dy;

                const textWidth = 220;
                const textHeight = 60;

                if (x <= 10 || x + textWidth >= canvas.width - 10) {
                    dx = -dx;
                }
                if (y <= 30 || y + textHeight >= canvas.height - 10) {
                    dy = -dy;
                }

                ctx.fillText(self.studentName, x, y);
                ctx.font = '12px sans-serif';
                ctx.fillText('ID: ' + self.studentId + ' | IP: ' + self.studentIp, x, y + 18);
                ctx.fillText(self.liveTime, x, y + 34);

                ctx.restore();
            };

            this.watermarkInterval = setInterval(drawWatermark, 1000 / 30);
        },

        /**
         * Setup anti-tamper DOM observers on watermark canvas.
         */
        setupAntiTamper: function() {
            const self = this;
            const canvas = this.canvas;
            const video = this.video;

            if (!this.watermarkEnabled || !canvas) {
                return;
            }

            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.type === 'attributes') {
                        const style = window.getComputedStyle(canvas);
                        if (style.display === 'none' ||
                            style.visibility === 'hidden' ||
                            parseFloat(style.opacity) < (self.watermarkOpacity * 0.5)) {
                            video.pause();
                            Notification.alert('Security Alert', 'Watermark modification detected. Video paused.', 'OK');
                        }
                    } else if (mutation.type === 'childList') {
                        mutation.removedNodes.forEach(function(node) {
                            if (node === canvas) {
                                video.pause();
                                self.restoreWatermarkCanvas();
                            }
                        });
                    }
                });
            });

            observer.observe(canvas.parentElement, {
                childList: true,
                attributes: true,
                subtree: true
            });
        },

        /**
         * Setup in-video interactive question overlay handlers.
         */
        setupQuestions: function() {
            const self = this;
            if (!this.questionOverlay || !this.questions || this.questions.length === 0) {
                return;
            }

            const submitBtn = this.questionOverlay.querySelector('.smartvideo-btn-submit, .securevideo-btn-submit');
            const continueBtn = this.questionOverlay.querySelector('.smartvideo-btn-continue, .securevideo-btn-continue');
            const retryBtn = this.questionOverlay.querySelector('.smartvideo-btn-retry, .securevideo-btn-retry');

            if (submitBtn) {
                submitBtn.addEventListener('click', function() {
                    self.submitQuestionAnswer();
                });
            }

            if (continueBtn) {
                continueBtn.addEventListener('click', function() {
                    self.continuePlayback();
                });
            }

            if (retryBtn) {
                retryBtn.addEventListener('click', function() {
                    if (self.activeQuestion) {
                        self.triggerQuestion(self.activeQuestion, true);
                    }
                });
            }

            // Timeline cue marker clicks.
            this.container.querySelectorAll('.smartvideo-cue-marker, .securevideo-cue-marker').forEach(function(marker) {
                marker.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const cueId = parseInt(marker.dataset.cueid, 10);
                    const q = self.questions.find(function(item) {
                        return item.id === cueId;
                    });
                    if (q) {
                        const unpassedQ = self.findFirstUnpassedQuestion(q.timecode);
                        if (unpassedQ && unpassedQ.id !== q.id) {
                            self.video.currentTime = unpassedQ.timecode;
                            self.triggerQuestion(unpassedQ, false);
                            return;
                        }
                        self.video.currentTime = q.timecode;
                        self.triggerQuestion(q, false);
                    }
                });
            });
        },

        /**
         * Find the first unpassed required question before or at target timestamp.
         *
         * @param {number} targetTime
         * @return {Object|null}
         */
        findFirstUnpassedQuestion: function(targetTime) {
            for (let i = 0; i < this.questions.length; i++) {
                const q = this.questions[i];
                const isRequired = (q.requirecorrect === 1 || q.requirecorrect === true || q.requirecorrect === '1');
                if (isRequired && !q.passed && targetTime >= q.timecode) {
                    return q;
                }
            }
            return null;
        },

        /**
         * Check playback position against question cuepoints.
         *
         * @param {number} currentTime
         */
        checkQuestionCuepoints: function(currentTime) {
            if (this.activeQuestion) {
                return;
            }

            const dur = this.video.duration || this.duration || 0;

            for (let i = 0; i < this.questions.length; i++) {
                const q = this.questions[i];
                if (!q.passed) {
                    const isRequired = (q.requirecorrect === 1 || q.requirecorrect === true || q.requirecorrect === '1');
                    // If cuepoint is at the very end of the video, trigger 1.2s before duration so HTML5 'ended' doesn't skip it.
                    const effectiveTime = (dur > 2 && q.timecode >= dur - 1) ? Math.max(0, dur - 1.2) : q.timecode;
                    if (isRequired) {
                        // If required and not passed, playback CANNOT advance past effectiveTime.
                        if (currentTime >= effectiveTime) {
                            this.video.pause();
                            this.video.currentTime = Math.min(q.timecode, currentTime);
                            this.triggerQuestion(q, false);
                            break;
                        }
                    } else {
                        // Informational question: trigger when crossing effectiveTime.
                        if (currentTime >= effectiveTime && (currentTime - effectiveTime) < 2.5 && !q.triggered) {
                            q.triggered = true;
                            this.video.pause();
                            this.triggerQuestion(q, false);
                            break;
                        }
                    }
                }
            }
        },

        /**
         * Clean up empty paragraphs, stray line breaks, and normalize option layout in Moodle Question Engine markup.
         *
         * @param {HTMLElement} containerEl
         * @param {boolean} isNative Whether native Moodle quiz style is active.
         */
        cleanQuestionMarkup: function(containerEl, isNative) {
            if (!containerEl) {
                return;
            }

            const answerEl = containerEl.querySelector('.answer');
            if (isNative) {
                if (answerEl) {
                    answerEl.classList.remove('sv-answer-grid');
                    answerEl.querySelectorAll('.r0, .r1').forEach(function(r) {
                        r.classList.remove('is-selected');
                    });
                }
                return;
            }

            // 1. Remove empty <p> tags (e.g., <p><br></p>, <p>&nbsp;</p>) generated by Atto/TinyMCE.
            containerEl.querySelectorAll('.qtext p, .answer p').forEach(function(p) {
                const text = (p.textContent || '').replace(/\u00a0/g, '').trim();
                const hasMedia = p.querySelector('img, video, audio, iframe, svg, input, select, textarea, code, pre');
                if (!text && !hasMedia) {
                    p.remove();
                    return;
                }
                // Strip leading and trailing <br> elements inside non-empty paragraphs.
                while (p.firstChild && p.firstChild.nodeType === 1 && p.firstChild.tagName === 'BR') {
                    p.removeChild(p.firstChild);
                }
                while (p.lastChild && p.lastChild.nodeType === 1 && p.lastChild.tagName === 'BR') {
                    p.removeChild(p.lastChild);
                }
            });

            // 2. If answer options are short or multi-line vertical snippets, use 2-column grid layout.
            if (answerEl) {
                const rows = answerEl.querySelectorAll('.r0, .r1');
                if (rows.length >= 2 && rows.length <= 4) {
                    let useGrid = true;
                    rows.forEach(function(r) {
                        const txt = (r.textContent || '').trim();
                        if (txt.length > 80) {
                            useGrid = false;
                        }
                    });
                    if (useGrid) {
                        answerEl.classList.add('sv-answer-grid');
                    }
                }

                // 3. Sync .is-selected state on option rows.
                const syncSelected = function() {
                    rows.forEach(function(r) {
                        const input = r.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (input && input.checked) {
                            r.classList.add('is-selected');
                        } else {
                            r.classList.remove('is-selected');
                        }
                    });
                };

                rows.forEach(function(row) {
                    const input = row.querySelector('input[type="radio"], input[type="checkbox"]');
                    if (input) {
                        input.addEventListener('change', syncSelected);
                    }
                    row.addEventListener('click', function(e) {
                        const radio = row.querySelector('input[type="radio"]');
                        if (radio && e.target !== radio && !radio.disabled) {
                            radio.checked = true;
                            syncSelected();
                        }
                    });
                });
                syncSelected();
            }
        },

        /**
         * Display in-video question overlay and load question attempt.
         *
         * @param {Object} question
         * @param {boolean} forcenew
         */
        triggerQuestion: function(question, forcenew) {
            const self = this;
            const overlay = this.questionOverlay;
            if (!overlay) {
                return;
            }

            this.activeQuestion = question;
            this.video.pause();

            const modalEl = overlay.querySelector('.sv-qmodal');
            const titleEl = overlay.querySelector('.smartvideo-q-title, .securevideo-q-title');
            const timecodeEl = overlay.querySelector('.smartvideo-q-timecode, .securevideo-q-timecode');
            const loadingEl = overlay.querySelector('.smartvideo-q-loading, .securevideo-q-loading');
            const contentEl = overlay.querySelector('.smartvideo-q-content, .securevideo-q-content');
            const feedbackEl = overlay.querySelector('.smartvideo-q-feedback, .securevideo-q-feedback');
            const submitBtn = overlay.querySelector('.smartvideo-btn-submit, .securevideo-btn-submit');
            const continueBtn = overlay.querySelector('.smartvideo-btn-continue, .securevideo-btn-continue');
            const retryBtn = overlay.querySelector('.smartvideo-btn-retry, .securevideo-btn-retry');
            const toggleStyleBtn = overlay.querySelector('.smartvideo-btn-toggle-style, .securevideo-btn-toggle-style');
            const styleLabel = overlay.querySelector('.sv-current-style-label');

            let currentStyle = question.questionstyle || 'compact';

            const applyStyleMode = function(style) {
                currentStyle = style;
                if (modalEl) {
                    if (style === 'native') {
                        modalEl.classList.add('sv-style-native');
                    } else {
                        modalEl.classList.remove('sv-style-native');
                    }
                }
                if (styleLabel) {
                    styleLabel.textContent = (style === 'native') ? 'Native Quiz' : 'Compact';
                }
                if (contentEl && !contentEl.classList.contains('d-none')) {
                    self.cleanQuestionMarkup(contentEl, style === 'native');
                }
            };

            applyStyleMode(currentStyle);

            if (toggleStyleBtn && !toggleStyleBtn._hasBoundClick) {
                toggleStyleBtn._hasBoundClick = true;
                toggleStyleBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const newStyle = (currentStyle === 'native') ? 'compact' : 'native';
                    question.questionstyle = newStyle;
                    applyStyleMode(newStyle);
                });
            }

            if (titleEl) {
                titleEl.innerHTML = '<i class="fa fa-question-circle me-2" aria-hidden="true"></i>' + question.title;
            }
            if (timecodeEl) {
                timecodeEl.textContent = formatTime(question.timecode);
            }

            loadingEl.classList.remove('d-none');
            contentEl.classList.add('d-none');
            feedbackEl.classList.add('d-none');
            continueBtn.classList.add('d-none');
            retryBtn.classList.add('d-none');
            submitBtn.classList.remove('d-none');
            submitBtn.disabled = true;

            overlay.classList.remove('d-none');
            const bodyEl = overlay.querySelector('.smartvideo-q-body, .securevideo-q-body');
            if (bodyEl) {
                bodyEl.scrollTop = 0;
            }

            Ajax.call([{
                methodname: 'mod_smartvideo_get_question_attempt',
                args: {
                    cmid: self.cmid,
                    svquestionid: question.id,
                    forcenew: !!forcenew
                }
            }])[0].then(function(res) {
                loadingEl.classList.add('d-none');
                contentEl.innerHTML = res.html;

                if (res.questionstyle) {
                    question.questionstyle = res.questionstyle;
                    applyStyleMode(res.questionstyle);
                } else {
                    applyStyleMode(currentStyle);
                }

                self.cleanQuestionMarkup(contentEl, currentStyle === 'native');
                contentEl.classList.remove('d-none');
                submitBtn.disabled = false;

                if (bodyEl) {
                    bodyEl.scrollTop = 0;
                }

                if (res.passed) {
                    submitBtn.classList.add('d-none');
                    continueBtn.classList.remove('d-none');
                    retryBtn.classList.remove('d-none');
                    retryBtn.innerHTML = '<i class="fa fa-rotate-left me-1" aria-hidden="true"></i>Retake Question';
                    continueBtn.focus();
                } else {
                    submitBtn.classList.remove('d-none');
                    submitBtn.disabled = false;
                    continueBtn.classList.add('d-none');
                    retryBtn.classList.add('d-none');
                }

                // Render MathJax if available.
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([contentEl]).catch(function() {});
                }
            }).catch(function(err) {
                Notification.exception(err);
                loadingEl.classList.add('d-none');
            });
        },

        /**
         * Submit student answer to backend Question Engine.
         */
        submitQuestionAnswer: function() {
            const self = this;
            const overlay = this.questionOverlay;
            const contentEl = overlay.querySelector('.smartvideo-q-content, .securevideo-q-content');
            const feedbackEl = overlay.querySelector('.smartvideo-q-feedback, .securevideo-q-feedback');
            const submitBtn = overlay.querySelector('.smartvideo-btn-submit, .securevideo-btn-submit');
            const continueBtn = overlay.querySelector('.smartvideo-btn-continue, .securevideo-btn-continue');
            const retryBtn = overlay.querySelector('.smartvideo-btn-retry, .securevideo-btn-retry');
            const q = this.activeQuestion;

            if (!q || !contentEl) {
                return;
            }

            // Collect form inputs.
            const formData = {};
            contentEl.querySelectorAll('input, select, textarea').forEach(function(input) {
                if (input.disabled) {
                    return;
                }
                if (input.type === 'radio' || input.type === 'checkbox') {
                    if (input.checked) {
                        formData[input.name] = input.value;
                    }
                } else if (input.name) {
                    formData[input.name] = input.value;
                }
            });

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Submitting...';

            Ajax.call([{
                methodname: 'mod_smartvideo_submit_question_attempt',
                args: {
                    cmid: self.cmid,
                    svquestionid: q.id,
                    formdata: JSON.stringify(formData)
                }
            }])[0].then(function(res) {
                submitBtn.classList.add('d-none');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa fa-check me-1" aria-hidden="true"></i>Submit Answer';

                feedbackEl.innerHTML = res.feedback_html;
                feedbackEl.classList.remove('d-none');

                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([feedbackEl]).catch(function() {});
                }

                if (res.is_correct) {
                    q.passed = true;
                    // Update cue marker color.
                    const marker = self.container.querySelector(
                        '.smartvideo-cue-marker[data-cueid="' + q.id + '"], ' +
                        '.securevideo-cue-marker[data-cueid="' + q.id + '"]'
                    );
                    if (marker) {
                        marker.classList.remove('bg-info');
                        marker.classList.add('bg-success');
                    }

                    continueBtn.classList.remove('d-none');
                    continueBtn.focus();

                    // Optional 3-second auto resume.
                    setTimeout(function() {
                        if (self.activeQuestion === q) {
                            self.continuePlayback();
                        }
                    }, 3000);
                } else {
                    const hasRewindTo = (res.rewind_to !== null && res.rewind_to !== undefined && res.rewind_to >= 0);
                    if (hasRewindTo) {
                        const rewindTargetTime = res.rewind_to;
                        const targetFormatted = formatTime(rewindTargetTime);
                        feedbackEl.insertAdjacentHTML('afterbegin',
                            '<div class="alert alert-warning py-2 mb-3">' +
                            '<i class="fa fa-rotate-left me-2"></i>' +
                            'Incorrect answer. Rewinding to ' + targetFormatted + ' to review...' +
                            '</div>'
                        );

                        setTimeout(function() {
                            overlay.classList.remove('d-flex');
                            overlay.classList.add('d-none');
                            self.activeQuestion = null;
                            self.video.currentTime = rewindTargetTime;
                            self.video.play();
                        }, 2500);
                    } else if (res.rewind_seconds > 0) {
                        const rewindTargetTime = Math.max(0, q.timecode - res.rewind_seconds);
                        const targetFormatted = formatTime(rewindTargetTime);
                        feedbackEl.insertAdjacentHTML('afterbegin',
                            '<div class="alert alert-warning py-2 mb-3">' +
                            '<i class="fa fa-rotate-left me-2"></i>' +
                            'Incorrect answer. Rewinding to ' + targetFormatted + ' to review...' +
                            '</div>'
                        );

                        setTimeout(function() {
                            overlay.classList.remove('d-flex');
                            overlay.classList.add('d-none');
                            self.activeQuestion = null;
                            self.video.currentTime = rewindTargetTime;
                            self.video.play();
                        }, 2500);
                    } else if (q.requirecorrect) {
                        retryBtn.classList.remove('d-none');
                        retryBtn.focus();
                    } else {
                        // Informational: allow student to retry or continue.
                        retryBtn.classList.remove('d-none');
                        continueBtn.classList.remove('d-none');
                        continueBtn.focus();
                    }
                }
            }).catch(function(err) {
                Notification.exception(err);
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa fa-check me-1" aria-hidden="true"></i>Submit Answer';
            });
        },

        /**
         * Close question overlay and continue playback.
         */
        continuePlayback: function() {
            if (this.questionOverlay) {
                this.questionOverlay.classList.remove('d-flex');
                this.questionOverlay.classList.add('d-none');
            }
            const q = this.activeQuestion;
            this.activeQuestion = null;

            if (q && this.video.currentTime <= q.timecode) {
                this.video.currentTime = q.timecode + 0.5; // Advance slightly past cuepoint.
            }

            this.video.play().catch(function(err) {
                console.warn('[SmartVideo] Continue playback failed:', err);
            });
        },

        /**
         * Re-create watermark canvas if removed by DevTools.
         */
        restoreWatermarkCanvas: function() {
            const ratioDiv = this.container.querySelector('.ratio');
            if (!ratioDiv) {
                return;
            }

            let canvas = this.container.querySelector('#smartVideoWatermarkCanvas, #secureVideoWatermarkCanvas, canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'secureVideoWatermarkCanvas';
                canvas.className = 'smartvideo-watermark-canvas securevideo-watermark-canvas position-absolute top-0 start-0 w-100 h-100';
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '50';
                ratioDiv.appendChild(canvas);
                this.canvas = canvas;
                this.setupWatermark();
            }
        },

        /**
         * Setup periodic progress beacon to Moodle backend.
         */
        setupProgressBeacon: function() {
            const self = this;

            this.beaconInterval = setInterval(function() {
                if (!self.video.paused) {
                    self.sendProgressBeacon();
                }
            }, 10000);

            window.addEventListener('beforeunload', function() {
                self.sendProgressBeacon();
            });
        },

        /**
         * Setup YouTube-style segmented chapters on timeline and Table of Contents in sidebar.
         */
        setupChapters: function() {
            const self = this;
            const container = this.container;
            const video = this.video;

            const pillBtn = container.querySelector('.smartvideo-chapter-pill, .smartvideo-chapter-inline-btn');
            const chapterList = container.querySelector('.smartvideo-chapters-list');
            const searchInput = container.querySelector('.smartvideo-search-chapters');

            // Render YouTube-Style discrete segmented chapter blocks.
            this.renderChapterSegments();

            // Re-render segments if video duration becomes known later (e.g. metadata loaded)
            if (video) {
                const onDurationChange = function() {
                    self.renderChapterSegments();
                };
                video.addEventListener('durationchange', onDurationChange);
                video.addEventListener('loadedmetadata', onDurationChange);
            }

            // Click on chapter inline button/pill opens/toggles the sidebar and focuses Chapters tab.
            if (pillBtn) {
                pillBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    self.openSidebarTab('tabBtnChapters');
                });
            }

            // Click on chapter item in sidebar seeks video to chapter start.
            if (chapterList) {
                chapterList.addEventListener('click', function(e) {
                    const item = e.target.closest('.smartvideo-chapter-item');
                    if (!item) {
                        return;
                    }
                    const timecode = parseInt(item.dataset.timecode, 10);
                    if (isNaN(timecode)) {
                        return;
                    }

                    // Gate check: First unpassed required question before chapter timecode.
                    const unpassedQ = self.findFirstUnpassedQuestion(timecode);
                    if (unpassedQ && timecode > unpassedQ.timecode) {
                        video.currentTime = unpassedQ.timecode;
                        self.triggerQuestion(unpassedQ, false);
                        return;
                    }

                    // Anti-seek check.
                    if (self.preventSeeking && timecode > (self.maxPosition + 2)) {
                        video.currentTime = self.maxPosition;
                        const seekNotice = container.querySelector('#smartVideoSeekNotice, #secureVideoSeekNotice');
                        if (seekNotice) {
                            seekNotice.classList.remove('d-none');
                            setTimeout(function() {
                                seekNotice.classList.add('d-none');
                            }, 2000);
                        }
                        return;
                    }

                    video.currentTime = timecode;
                    if (video.paused && !self.activeQuestion) {
                        video.play().catch(function() {});
                    }
                });
            }

            // Search filter for chapters list.
            if (searchInput && chapterList) {
                searchInput.addEventListener('input', function(e) {
                    const q = (e.target.value || '').toLowerCase().trim();
                    const items = chapterList.querySelectorAll('.smartvideo-chapter-item');
                    items.forEach(function(item) {
                        const title = (item.querySelector('.smartvideo-chapter-title')?.textContent || '').toLowerCase();
                        if (!q || title.indexOf(q) !== -1) {
                            item.classList.remove('d-none');
                        } else {
                            item.classList.add('d-none');
                        }
                    });
                });
            }
        },

        /**
         * Dynamically construct and render YouTube-style chapter segment DOM nodes in seekbar.
         */
        renderChapterSegments: function() {
            const container = this.container;
            const segmentsContainer = container.querySelector('.smartvideo-segments-container');
            if (!segmentsContainer) {
                return;
            }

            const video = this.video;
            const dur = (video && video.duration > 0) ? video.duration : (this.duration || 0);
            const chapters = this.chapters || [];

            segmentsContainer.innerHTML = '';
            this.cachedSegments = [];

            // Case 1: No chapters or zero duration -> render single continuous segment
            if (!chapters || chapters.length === 0 || dur <= 0) {
                const segEl = document.createElement('div');
                segEl.className = 'smartvideo-segment';
                segEl.style.flex = '1 1 0%';

                const bgEl = document.createElement('div');
                bgEl.className = 'smartvideo-segment-bg';

                const bufEl = document.createElement('div');
                bufEl.className = 'smartvideo-segment-buffered';
                bufEl.style.width = '0%';

                const progEl = document.createElement('div');
                progEl.className = 'smartvideo-segment-progress';
                progEl.style.width = '0%';

                segEl.appendChild(bgEl);
                segEl.appendChild(bufEl);
                segEl.appendChild(progEl);
                segmentsContainer.appendChild(segEl);

                this.cachedSegments.push({
                    start: 0,
                    end: dur > 0 ? dur : 1,
                    duration: dur > 0 ? dur : 1,
                    title: '',
                    segEl: segEl,
                    bufEl: bufEl,
                    progEl: progEl,
                    progWidth: 0,
                    bufWidth: 0
                });
                return;
            }

            // Case 2: Multi-chapter segmented timeline
            const sorted = chapters.slice().sort(function(a, b) {
                return (a.timecode || 0) - (b.timecode || 0);
            });

            const segRanges = [];
            // If the first chapter does not begin at 0, create an introductory segment 0 to start of first chapter
            if (sorted[0].timecode > 0) {
                segRanges.push({
                    title: sorted[0].title || '',
                    start: 0,
                    end: sorted[0].timecode,
                    duration: sorted[0].timecode
                });
            }

            for (let i = 0; i < sorted.length; i++) {
                const start = sorted[i].timecode;
                const nextStart = (i + 1 < sorted.length) ? sorted[i + 1].timecode : dur;
                const end = Math.max(start + 0.1, nextStart > start ? nextStart : (dur > start ? dur : start + 1));
                const segDur = Math.max(0.1, end - start);
                segRanges.push({
                    title: sorted[i].title,
                    start: start,
                    end: end,
                    duration: segDur
                });
            }

            const self = this;
            segRanges.forEach(function(s) {
                const segEl = document.createElement('div');
                segEl.className = 'smartvideo-segment';
                segEl.style.flex = s.duration + ' 1 0%';
                segEl.dataset.start = s.start;
                segEl.dataset.end = s.end;
                segEl.dataset.title = s.title;

                const bgEl = document.createElement('div');
                bgEl.className = 'smartvideo-segment-bg';

                const bufEl = document.createElement('div');
                bufEl.className = 'smartvideo-segment-buffered';
                bufEl.style.width = '0%';

                const progEl = document.createElement('div');
                progEl.className = 'smartvideo-segment-progress';
                progEl.style.width = '0%';

                segEl.appendChild(bgEl);
                segEl.appendChild(bufEl);
                segEl.appendChild(progEl);
                segmentsContainer.appendChild(segEl);

                self.cachedSegments.push({
                    start: s.start,
                    end: s.end,
                    duration: s.duration,
                    title: s.title,
                    segEl: segEl,
                    bufEl: bufEl,
                    progEl: progEl,
                    progWidth: 0,
                    bufWidth: 0
                });
            });

            // Trigger an immediate progress calculation to sync with current video time
            if (video && video.currentTime > 0) {
                const cur = video.currentTime;
                let bEnd = 0;
                if (video.buffered.length > 0) {
                    bEnd = video.buffered.end(video.buffered.length - 1);
                }
                for (let i = 0; i < this.cachedSegments.length; i++) {
                    const seg = this.cachedSegments[i];
                    if (cur >= seg.end) {
                        seg.progEl.style.width = '100%';
                        seg.progWidth = 100;
                    } else if (cur <= seg.start) {
                        seg.progEl.style.width = '0%';
                        seg.progWidth = 0;
                    } else if (seg.duration > 0) {
                        const pct = Math.min(100, Math.max(0, ((cur - seg.start) / seg.duration) * 100));
                        seg.progEl.style.width = pct + '%';
                        seg.progWidth = pct;
                    }

                    if (bEnd >= seg.end) {
                        seg.bufEl.style.width = '100%';
                        seg.bufWidth = 100;
                    } else if (bEnd <= seg.start) {
                        seg.bufEl.style.width = '0%';
                        seg.bufWidth = 0;
                    } else if (seg.duration > 0) {
                        const bPct = Math.min(100, Math.max(0, ((bEnd - seg.start) / seg.duration) * 100));
                        seg.bufEl.style.width = bPct + '%';
                        seg.bufWidth = bPct;
                    }
                }
            }
        },

        /**
         * Get the chapter active at a given timecode.
         *
         * @param {number} time
         * @return {Object|null}
         */
        getChapterForTime: function(time) {
            if (!this.chapters || this.chapters.length === 0) {
                return null;
            }
            let active = null;
            for (let i = 0; i < this.chapters.length; i++) {
                if (this.chapters[i].timecode <= time) {
                    active = this.chapters[i];
                } else {
                    break;
                }
            }
            return active;
        },

        /**
         * Update active chapter UI based on current video time.
         *
         * @param {number} curTime
         */
        updateActiveChapter: function(curTime) {
            const chap = this.getChapterForTime(curTime);
            if (!chap) {
                return;
            }

            // Update chapter pill and inline button in control bar.
            const pillLabels = this.container.querySelectorAll('.smartvideo-chapter-pill-label, .smartvideo-chapter-inline-title');
            pillLabels.forEach(function(pillLabel) {
                if (pillLabel.textContent !== chap.title) {
                    pillLabel.textContent = chap.title;
                }
            });

            const inlineWrap = this.container.querySelector('.smartvideo-chapter-inline-wrap');
            if (inlineWrap && inlineWrap.classList.contains('d-none')) {
                inlineWrap.classList.remove('d-none');
            }

            // Update active state in sidebar list.
            const items = this.container.querySelectorAll('.smartvideo-chapter-item');
            items.forEach(function(item) {
                const itemTime = parseInt(item.dataset.timecode, 10);
                if (itemTime === chap.timecode) {
                    item.classList.add('is-active');
                } else {
                    item.classList.remove('is-active');
                }
            });
        },

        /**
         * Setup In-Video Callout Cards overlay and actions.
         */
        setupCallouts: function() {
            const self = this;
            const overlay = this.calloutOverlay;
            if (!overlay) {
                return;
            }

            const closeBtn = overlay.querySelector('.smartvideo-btn-callout-close');
            const contBtn = overlay.querySelector('.smartvideo-btn-callout-continue');

            const dismissCallout = function() {
                overlay.classList.add('d-none');
                clearTimeout(self.calloutTimer);
                if (self.activeCallout && self.activeCallout.autopause && self.video.paused) {
                    self.video.play().catch(function() {});
                }
                self.activeCallout = null;
            };

            if (closeBtn) {
                closeBtn.addEventListener('click', dismissCallout);
            }
            if (contBtn) {
                contBtn.addEventListener('click', dismissCallout);
            }
        },

        /**
         * Check and trigger in-video callouts at current timestamp.
         *
         * @param {number} curTime
         */
        checkCallouts: function(curTime) {
            if (!this.callouts || this.callouts.length === 0 || this.activeQuestion) {
                return;
            }
            const self = this;
            for (let i = 0; i < this.callouts.length; i++) {
                const c = this.callouts[i];
                if (!c.triggered && curTime >= c.timecode && curTime <= (c.timecode + 2)) {
                    c.triggered = true;
                    self.triggerCallout(c);
                    break;
                }
            }
        },

        /**
         * Trigger and render an in-video callout card.
         *
         * @param {Object} callout
         */
        triggerCallout: function(callout) {
            const overlay = this.calloutOverlay;
            if (!overlay) {
                return;
            }
            this.activeCallout = callout;
            clearTimeout(this.calloutTimer);

            const titleEl = overlay.querySelector('.smartvideo-callout-title');
            const bodyEl = overlay.querySelector('.smartvideo-callout-body');
            const linkBtn = overlay.querySelector('.smartvideo-callout-link');
            const linkLabel = overlay.querySelector('.smartvideo-callout-link-label');
            const contBtn = overlay.querySelector('.smartvideo-btn-callout-continue');

            if (titleEl) {
                titleEl.textContent = callout.title || 'Information';
            }
            if (bodyEl) {
                bodyEl.innerHTML = callout.body || '';
            }

            if (linkBtn) {
                if (callout.linkurl) {
                    linkBtn.href = callout.linkurl;
                    if (linkLabel) {
                        linkLabel.textContent = callout.linklabel || 'Open Resource';
                    }
                    linkBtn.classList.remove('d-none');
                } else {
                    linkBtn.classList.add('d-none');
                }
            }

            // Position class.
            overlay.className = 'smartvideo-callout-overlay position-absolute p-3 pos-' + (callout.position || 'bottom-right');

            if (callout.autopause) {
                this.video.pause();
                if (contBtn) {
                    contBtn.classList.remove('d-none');
                }
            } else {
                if (contBtn) {
                    contBtn.classList.add('d-none');
                }
                const dur = Math.max(2, callout.duration || 8);
                const self = this;
                this.calloutTimer = setTimeout(function() {
                    overlay.classList.add('d-none');
                    self.activeCallout = null;
                }, dur * 1000);
            }

            overlay.classList.remove('d-none');
        },

        /**
         * Setup Workstation Sidebar toggle, split-view mode, and close handlers.
         */
        setupWorkstationSidebar: function() {
            const self = this;
            const container = this.container;
            const sidebar = container.querySelector('.smartvideo-sidebar');
            const toggleBtn = container.querySelector('.smartvideo-btn-sidebar');
            const modeBtn = container.querySelector('.smartvideo-btn-sidebar-mode');
            const closeBtn = container.querySelector('.smartvideo-btn-sidebar-close');

            if (!sidebar) {
                return;
            }

            const toggleSidebar = function() {
                const isHidden = sidebar.classList.contains('d-none');
                if (isHidden) {
                    sidebar.classList.remove('d-none');
                    container.classList.add('is-sidebar-open');
                } else {
                    sidebar.classList.add('d-none');
                    container.classList.remove('is-sidebar-open');
                }
                if (self.canvas && typeof self.resizeCanvas === 'function') {
                    setTimeout(function() {
                        self.resizeCanvas();
                    }, 60);
                }
            };

            if (toggleBtn) {
                toggleBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleSidebar();
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    sidebar.classList.add('d-none');
                    container.classList.remove('is-sidebar-open');
                    if (self.canvas && typeof self.resizeCanvas === 'function') {
                        setTimeout(function() {
                            self.resizeCanvas();
                        }, 60);
                    }
                });
            }

            if (modeBtn) {
                modeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    container.classList.toggle('is-sidebar-overlay');
                    const isOverlay = container.classList.contains('is-sidebar-overlay');
                    modeBtn.innerHTML = isOverlay ?
                        '<i class="fa fa-table-columns" aria-hidden="true"></i>' :
                        '<i class="fa fa-window-maximize" aria-hidden="true"></i>';
                    modeBtn.setAttribute('title', isOverlay ? 'Side-by-side view' : 'Overlay view');
                    if (self.canvas && typeof self.resizeCanvas === 'function') {
                        setTimeout(function() {
                            self.resizeCanvas();
                        }, 60);
                    }
                });
            }

            // Setup Draggable Sidebar Resizer.
            const resizer = sidebar.querySelector('.smartvideo-sidebar-resizer');
            if (resizer) {
                try {
                    const savedWidth = parseInt(localStorage.getItem('smartvideo_sidebar_width'), 10);
                    if (savedWidth && savedWidth >= 280 && savedWidth <= 900) {
                        sidebar.style.setProperty('--smartvideo-sidebar-width', savedWidth + 'px');
                    }
                } catch (e) {}

                let isDragging = false;
                let startX = 0;
                let startWidth = 0;

                const onMouseDown = function(e) {
                    e.preventDefault();
                    isDragging = true;
                    startX = e.clientX;
                    startWidth = sidebar.getBoundingClientRect().width;

                    resizer.classList.add('is-dragging');
                    container.classList.add('is-resizing-sidebar');
                    document.body.style.userSelect = 'none';
                    document.body.style.cursor = 'col-resize';

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                };

                const onMouseMove = function(e) {
                    if (!isDragging) {
                        return;
                    }
                    const containerRect = container.getBoundingClientRect();
                    const isRtl = document.documentElement.dir === 'rtl' || container.closest('[dir="rtl"]') !== null;
                    const delta = isRtl ? (e.clientX - startX) : (startX - e.clientX);
                    let newWidth = startWidth + delta;

                    const minWidth = 280;
                    const maxWidth = Math.max(minWidth, Math.min(850, containerRect.width - 320));
                    newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));

                    sidebar.style.setProperty('--smartvideo-sidebar-width', newWidth + 'px');

                    if (self.canvas && typeof self.resizeCanvas === 'function') {
                        self.resizeCanvas();
                    }
                };

                const onMouseUp = function() {
                    if (!isDragging) {
                        return;
                    }
                    isDragging = false;
                    resizer.classList.remove('is-dragging');
                    container.classList.remove('is-resizing-sidebar');
                    document.body.style.userSelect = '';
                    document.body.style.cursor = '';

                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);

                    try {
                        const finalWidth = Math.round(sidebar.getBoundingClientRect().width);
                        localStorage.setItem('smartvideo_sidebar_width', finalWidth);
                    } catch (e) {}

                    if (self.canvas && typeof self.resizeCanvas === 'function') {
                        self.resizeCanvas();
                    }
                };

                resizer.addEventListener('mousedown', onMouseDown);

                resizer.addEventListener('touchstart', function(e) {
                    if (e.touches && e.touches[0]) {
                        onMouseDown({
                            preventDefault: function() { e.preventDefault(); },
                            clientX: e.touches[0].clientX
                        });
                    }
                }, { passive: false });

                window.addEventListener('touchmove', function(e) {
                    if (isDragging && e.touches && e.touches[0]) {
                        onMouseMove({
                            clientX: e.touches[0].clientX
                        });
                    }
                }, { passive: true });

                window.addEventListener('touchend', function() {
                    if (isDragging) {
                        onMouseUp();
                    }
                });
            }

            // Sync active tab title in header when clicking or switching tabs.
            const activeTitleEl = sidebar.querySelector('.smartvideo-sidebar-active-tab-title');
            const tabButtons = sidebar.querySelectorAll('.smartvideo-sidebar-tabs button[data-bs-toggle="pill"]');
            tabButtons.forEach(function(btn) {
                btn.addEventListener('shown.bs.tab', function(e) {
                    if (activeTitleEl) {
                        const title = (e.target.getAttribute('title') || '').trim();
                        if (title) {
                            activeTitleEl.textContent = title;
                        }
                    }
                });
                btn.addEventListener('click', function() {
                    if (activeTitleEl) {
                        const title = (btn.getAttribute('title') || '').trim();
                        if (title) {
                            activeTitleEl.textContent = title;
                        }
                    }
                });
            });
        },

        /**
         * Setup Student Timestamped Notes in the Workstation Sidebar.
         */
        setupNotes: function() {
            const self = this;
            const container = this.container;
            const video = this.video;

            const timeBtn = container.querySelector('#svNoteCurrentTimeBtn');
            const timeDisplay = container.querySelector('#svNoteTimeDisplay');
            const noteInput = container.querySelector('#svNoteInput');
            const saveBtn = container.querySelector('#svSaveNoteBtn');
            const notesList = container.querySelector('#svNotesList');
            const exportBtn = container.querySelector('#svExportNotesBtn');
            const printBtn = container.querySelector('#svPrintNotesBtn');
            const countBadge = container.querySelector('.smartvideo-notes-count-badge');

            if (!notesList) {
                return;
            }

            let selectedTimecode = 0;

            const updateStampDisplay = function() {
                selectedTimecode = Math.floor(video.currentTime || 0);
                if (timeDisplay) {
                    timeDisplay.textContent = formatTime(selectedTimecode);
                }
            };

            if (timeBtn) {
                timeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    updateStampDisplay();
                });
            }

            // Sync stamp display when note input is focused if not already set.
            if (noteInput) {
                noteInput.addEventListener('focus', function() {
                    if (selectedTimecode === 0 && video.currentTime > 0) {
                        updateStampDisplay();
                    }
                });
            }

            if (saveBtn && noteInput) {
                saveBtn.addEventListener('click', function() {
                    const text = noteInput.value.trim();
                    if (!text) {
                        Notification.alert('Required Field', 'Please enter some text for your note.', 'OK');
                        return;
                    }

                    const timecodeToSave = (selectedTimecode > 0) ? selectedTimecode : Math.floor(video.currentTime || 0);

                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Saving...';

                    Ajax.call([{
                        methodname: 'mod_smartvideo_save_note',
                        args: {
                            cmid: self.cmid,
                            noteid: 0,
                            timecode: timecodeToSave,
                            content: text
                        }
                    }])[0].then(function(res) {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa fa-plus me-1"></i>Add Note';
                        if (res && res.status) {
                            noteInput.value = '';
                            selectedTimecode = 0;
                            if (timeDisplay) {
                                timeDisplay.textContent = '00:00';
                            }

                            // Remove empty placeholder if present.
                            const placeholder = notesList.querySelector('.sv-no-notes-placeholder');
                            if (placeholder) {
                                placeholder.remove();
                            }

                            // Render new note card.
                            const card = document.createElement('div');
                            card.className = 'card bg-black bg-opacity-30 border-secondary border-opacity-25 p-2 smartvideo-note-card';
                            card.dataset.noteid = res.id;
                            card.dataset.timecode = res.timecode;
                            card.innerHTML =
                                '<div class="d-flex justify-content-between align-items-center mb-1">' +
                                    '<button type="button" class="btn btn-xs btn-outline-primary py-0 px-1 font-monospace btn-note-seek" data-timecode="' + res.timecode + '">' +
                                        '<i class="fa fa-play fa-xs me-1"></i>' + res.timeformatted +
                                    '</button>' +
                                    '<button type="button" class="btn btn-link text-danger p-0 btn-note-delete" title="Delete note">' +
                                        '<i class="fa fa-trash fa-xs"></i>' +
                                    '</button>' +
                                '</div>' +
                                '<div class="small text-white note-content-text">' + res.content + '</div>';

                            notesList.appendChild(card);

                            // Update count badge.
                            if (countBadge) {
                                const currentCount = parseInt(countBadge.textContent, 10) || 0;
                                countBadge.textContent = String(currentCount + 1);
                            }
                        }
                    }).catch(function(err) {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = '<i class="fa fa-plus me-1"></i>Add Note';
                        Notification.exception(err);
                    });
                });
            }

            // Click delegation for seek and delete on notes list.
            notesList.addEventListener('click', function(e) {
                const seekBtn = e.target.closest('.btn-note-seek');
                if (seekBtn) {
                    const timecode = parseInt(seekBtn.dataset.timecode, 10);
                    if (!isNaN(timecode)) {
                        video.currentTime = timecode;
                        if (video.paused && !self.activeQuestion) {
                            video.play().catch(function() {});
                        }
                    }
                    return;
                }

                const deleteBtn = e.target.closest('.btn-note-delete');
                if (deleteBtn) {
                    const card = deleteBtn.closest('.smartvideo-note-card');
                    if (!card) {
                        return;
                    }
                    const noteId = parseInt(card.dataset.noteid, 10);

                    Notification.confirm('Delete Note', 'Are you sure you want to delete this note?', 'Delete', 'Cancel', function() {
                        Ajax.call([{
                            methodname: 'mod_smartvideo_delete_note',
                            args: {
                                cmid: self.cmid,
                                noteid: noteId
                            }
                        }])[0].then(function(res) {
                            if (res && res.status) {
                                card.remove();
                                if (countBadge) {
                                    const currentCount = Math.max(0, (parseInt(countBadge.textContent, 10) || 1) - 1);
                                    countBadge.textContent = String(currentCount);
                                }
                                if (notesList.querySelectorAll('.smartvideo-note-card').length === 0) {
                                    notesList.innerHTML =
                                        '<div class="text-center py-4 text-white-50 small sv-no-notes-placeholder">' +
                                            '<i class="fa fa-pencil fa-2x mb-2 opacity-50" aria-hidden="true"></i>' +
                                            '<div>No notes yet. Jot down key ideas while watching!</div>' +
                                        '</div>';
                                }
                            }
                        }).catch(Notification.exception);
                    });
                }
            });

            // Export Notes as text file.
            if (exportBtn) {
                exportBtn.addEventListener('click', function() {
                    const cards = notesList.querySelectorAll('.smartvideo-note-card');
                    if (cards.length === 0) {
                        Notification.alert('Notice', 'No notes to export yet.', 'OK');
                        return;
                    }

                    let content = 'Smart Video Notes\n';
                    content += 'Video: ' + (container.dataset.title || 'Lesson Video') + '\n';
                    content += 'Date: ' + (new Date()).toLocaleDateString() + '\n';
                    content += '--------------------------------------------------\n\n';

                    cards.forEach(function(card) {
                        const time = card.querySelector('.btn-note-seek')?.textContent.trim() || '00:00';
                        const text = card.querySelector('.note-content-text')?.textContent.trim() || '';
                        content += '[' + time + '] ' + text + '\n\n';
                    });

                    const blob = new Blob([content], {type: 'text/plain;charset=utf-8'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'notes_' + (new Date()).toISOString().slice(0, 10) + '.txt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
            }

            // Print Notes.
            if (printBtn) {
                printBtn.addEventListener('click', function() {
                    const cards = notesList.querySelectorAll('.smartvideo-note-card');
                    if (cards.length === 0) {
                        Notification.alert('Notice', 'No notes to print.', 'OK');
                        return;
                    }

                    let printHtml = '<html><head><title>Notes - ' + (container.dataset.title || 'Video') + '</title>';
                    printHtml += '<style>body{font-family:sans-serif;padding:24px;line-height:1.5;} .note{margin-bottom:16px;border-bottom:1px solid #ddd;padding-bottom:12px;} .time{font-family:monospace;font-weight:bold;color:#0d6efd;margin-right:8px;}</style></head><body>';
                    printHtml += '<h2>' + (container.dataset.title || 'Video Notes') + '</h2><hr>';

                    cards.forEach(function(card) {
                        const time = card.querySelector('.btn-note-seek')?.textContent.trim() || '00:00';
                        const text = card.querySelector('.note-content-text')?.textContent.trim() || '';
                        printHtml += '<div class="note"><span class="time">[' + time + ']</span> ' + text + '</div>';
                    });

                    printHtml += '</body></html>';

                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                        printWindow.document.write(printHtml);
                        printWindow.document.close();
                        printWindow.focus();
                        printWindow.print();
                    }
                });
            }
        },

        /**
         * Setup Scientific and Clinical Calculator in Workstation Sidebar.
         */
        setupCalculator: function() {
            const container = this.container;
            const standardBtn = container.querySelector('#calcModeStandardBtn');
            const clinicalBtn = container.querySelector('#calcModeClinicalBtn');
            const standardView = container.querySelector('#calcStandardView');
            const clinicalView = container.querySelector('#calcClinicalView');

            if (!standardView) {
                return;
            }

            // Mode switching.
            if (standardBtn && clinicalBtn) {
                standardBtn.addEventListener('click', function() {
                    standardBtn.classList.add('active');
                    clinicalBtn.classList.remove('active');
                    standardView.classList.remove('d-none');
                    clinicalView.classList.add('d-none');
                });
                clinicalBtn.addEventListener('click', function() {
                    clinicalBtn.classList.add('active');
                    standardBtn.classList.remove('active');
                    clinicalView.classList.remove('d-none');
                    standardView.classList.add('d-none');
                });
            }

            // --- Standard / Sci Calculator Engine ---
            const display = container.querySelector('#calcDisplay');
            const formula = container.querySelector('#calcFormula');
            let currentExpr = '';

            const updateCalcDisplay = function(val) {
                if (display) {
                    display.value = val;
                }
            };

            container.querySelectorAll('.calc-key').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const key = btn.dataset.key;

                    if (key === 'C') {
                        currentExpr = '';
                        if (formula) {
                            formula.textContent = '';
                        }
                        updateCalcDisplay('0');
                    } else if (key === 'BACK') {
                        currentExpr = currentExpr.slice(0, -1);
                        updateCalcDisplay(currentExpr || '0');
                    } else if (key === '=') {
                        if (!currentExpr) {
                            return;
                        }
                        try {
                            if (formula) {
                                formula.textContent = currentExpr + ' =';
                            }
                            // Sanitize math expression (only allow digits, operators, parens, decimal).
                            const sanitized = currentExpr.replace(/[^0-9+\-*/().]/g, '');
                            // Safe math calculation using Function constructor with sanitized input.
                            const result = Function('"use strict"; return (' + sanitized + ')')();
                            const formatted = Number.isFinite(result) ?
                                (Number.isInteger(result) ? result : parseFloat(result.toFixed(6))) : 'Error';
                            updateCalcDisplay(formatted);
                            currentExpr = String(formatted);
                        } catch (err) {
                            updateCalcDisplay('Error');
                            currentExpr = '';
                        }
                    } else if (key === 'sqrt') {
                        try {
                            const val = parseFloat(display.value) || 0;
                            if (val < 0) {
                                updateCalcDisplay('Error');
                            } else {
                                const result = Math.sqrt(val);
                                updateCalcDisplay(parseFloat(result.toFixed(6)));
                                currentExpr = String(result);
                            }
                        } catch (err) {
                            updateCalcDisplay('Error');
                        }
                    } else if (key === 'sq') {
                        try {
                            const val = parseFloat(display.value) || 0;
                            const result = val * val;
                            updateCalcDisplay(parseFloat(result.toFixed(6)));
                            currentExpr = String(result);
                        } catch (err) {
                            updateCalcDisplay('Error');
                        }
                    } else if (key === '%') {
                        try {
                            const val = parseFloat(display.value) || 0;
                            const result = val / 100;
                            updateCalcDisplay(parseFloat(result.toFixed(6)));
                            currentExpr = String(result);
                        } catch (err) {
                            updateCalcDisplay('Error');
                        }
                    } else {
                        currentExpr += key;
                        updateCalcDisplay(currentExpr);
                    }
                });
            });

            // --- Clinical Presets ---
            // BMI
            const calcBmiBtn = container.querySelector('#btnCalcBmi');
            if (calcBmiBtn) {
                calcBmiBtn.addEventListener('click', function() {
                    const weight = parseFloat(container.querySelector('#bmiWeight')?.value) || 0;
                    const height = parseFloat(container.querySelector('#bmiHeight')?.value) || 0;
                    const resBox = container.querySelector('#bmiResult');
                    const valEl = container.querySelector('#bmiValue');
                    const catEl = container.querySelector('#bmiCategory');

                    if (weight <= 0 || height <= 0 || !resBox || !valEl || !catEl) {
                        return;
                    }

                    const heightM = height / 100;
                    const bmi = weight / (heightM * heightM);
                    valEl.textContent = bmi.toFixed(1) + ' kg/m²';

                    let cat = 'Normal';
                    let catClass = 'text-success';
                    if (bmi < 18.5) {
                        cat = 'Underweight';
                        catClass = 'text-info';
                    } else if (bmi >= 25 && bmi < 30) {
                        cat = 'Overweight';
                        catClass = 'text-warning';
                    } else if (bmi >= 30) {
                        cat = 'Obese';
                        catClass = 'text-danger';
                    }

                    catEl.textContent = cat;
                    catEl.className = 'small fw-semibold mt-1 ' + catClass;
                    resBox.classList.remove('d-none');
                });
            }

            // MAP (Mean Arterial Pressure)
            const calcMapBtn = container.querySelector('#btnCalcMap');
            if (calcMapBtn) {
                calcMapBtn.addEventListener('click', function() {
                    const sys = parseFloat(container.querySelector('#mapSystolic')?.value) || 0;
                    const dia = parseFloat(container.querySelector('#mapDiastolic')?.value) || 0;
                    const resBox = container.querySelector('#mapResult');
                    const valEl = container.querySelector('#mapValue');

                    if (sys <= 0 || dia <= 0 || !resBox || !valEl) {
                        return;
                    }

                    const map = dia + ((sys - dia) / 3);
                    valEl.textContent = map.toFixed(1);
                    resBox.classList.remove('d-none');
                });
            }

            // eGFR (CKD-EPI)
            const calcEgfrBtn = container.querySelector('#btnCalcEgfr');
            if (calcEgfrBtn) {
                calcEgfrBtn.addEventListener('click', function() {
                    const scr = parseFloat(container.querySelector('#egfrCreatinine')?.value) || 0;
                    const age = parseFloat(container.querySelector('#egfrAge')?.value) || 0;
                    const sex = container.querySelector('#egfrSex')?.value || 'male';
                    const resBox = container.querySelector('#egfrResult');
                    const valEl = container.querySelector('#egfrValue');
                    const stageEl = container.querySelector('#egfrStage');

                    if (scr <= 0 || age <= 0 || !resBox || !valEl || !stageEl) {
                        return;
                    }

                    const isFemale = (sex === 'female');
                    const kappa = isFemale ? 0.7 : 0.9;
                    const alpha = isFemale ? -0.241 : -0.302;
                    const factor = isFemale ? 1.012 : 1.0;

                    const minRatio = Math.min(scr / kappa, 1);
                    const maxRatio = Math.max(scr / kappa, 1);

                    const egfr = 142 * Math.pow(minRatio, alpha) * Math.pow(maxRatio, -1.200) * Math.pow(0.9938, age) * factor;
                    valEl.textContent = egfr.toFixed(0);

                    let stage = 'G1: Normal / High';
                    if (egfr < 15) {
                        stage = 'G5: Kidney Failure';
                    } else if (egfr < 30) {
                        stage = 'G4: Severely Decreased';
                    } else if (egfr < 45) {
                        stage = 'G3b: Moderately to Severely Decreased';
                    } else if (egfr < 60) {
                        stage = 'G3a: Mildly to Moderately Decreased';
                    } else if (egfr < 90) {
                        stage = 'G2: Mildly Decreased';
                    }

                    stageEl.textContent = stage;
                    resBox.classList.remove('d-none');
                });
            }
        },

        /**
         * Setup Structured Medical / Case Report in Workstation Sidebar.
         */
        setupReport: function() {
            const self = this;
            const container = this.container;
            const video = this.video;

            const findingsInput = container.querySelector('#reportFindings');
            const impressionInput = container.querySelector('#reportImpression');
            const diagnosisInput = container.querySelector('#reportDiagnosis');
            const recommendationsInput = container.querySelector('#reportRecommendations');
            const saveDraftBtn = container.querySelector('#btnSaveReportDraft');
            const submitBtn = container.querySelector('#btnSubmitReport');
            const statusBadge = container.querySelector('#reportStatusBadge');
            const savedIndicator = container.querySelector('#reportSavedIndicator');
            const citeTimeBtn = container.querySelector('#btnCiteTime');
            const citeTimeVal = container.querySelector('#citeTimeVal');

            if (!findingsInput) {
                return;
            }

            let lastFocusedTextarea = findingsInput;
            const allInputs = [findingsInput, impressionInput, diagnosisInput, recommendationsInput];

            allInputs.forEach(function(input) {
                if (input) {
                    input.addEventListener('focus', function() {
                        lastFocusedTextarea = input;
                    });
                }
            });

            // Update cite button timecode display on timeupdate
            video.addEventListener('timeupdate', function() {
                if (citeTimeVal) {
                    citeTimeVal.textContent = formatTime(video.currentTime);
                }
            });

            // Cite time button inserts "[MM:SS] " into active textarea.
            if (citeTimeBtn) {
                citeTimeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const target = lastFocusedTextarea || findingsInput;
                    const stamp = '[' + formatTime(video.currentTime) + '] ';
                    const startPos = target.selectionStart || target.value.length;
                    const endPos = target.selectionEnd || target.value.length;
                    target.value = target.value.substring(0, startPos) + stamp + target.value.substring(endPos);
                    target.selectionStart = target.selectionEnd = startPos + stamp.length;
                    target.focus();
                });
            }

            const saveReport = function(status, showNotification) {
                const findings = (findingsInput ? findingsInput.value : '').trim();
                const impression = (impressionInput ? impressionInput.value : '').trim();
                const diagnosis = (diagnosisInput ? diagnosisInput.value : '').trim();
                const recommendations = (recommendationsInput ? recommendationsInput.value : '').trim();

                return Ajax.call([{
                    methodname: 'mod_smartvideo_save_report',
                    args: {
                        cmid: self.cmid,
                        findings: findings,
                        impression: impression,
                        diagnosis: diagnosis,
                        recommendations: recommendations,
                        status: status
                    }
                }])[0].then(function(res) {
                    if (res && res.status) {
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
                        if (savedIndicator) {
                            savedIndicator.textContent = 'Saved ' + timeStr;
                        }
                        if (statusBadge) {
                            if (res.reportstatus === 'submitted') {
                                statusBadge.className = 'badge bg-success';
                                statusBadge.textContent = 'Submitted';
                            } else {
                                statusBadge.className = 'badge bg-warning text-dark';
                                statusBadge.textContent = 'Draft';
                            }
                        }
                        if (showNotification) {
                            Notification.alert('Success', status === 'submitted' ? 'Your case report has been submitted!' : 'Draft saved successfully.', 'OK');
                        }
                    }
                }).catch(function(err) {
                    if (showNotification) {
                        Notification.exception(err);
                    }
                });
            };

            if (saveDraftBtn) {
                saveDraftBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    saveReport('draft', true);
                });
            }

            if (submitBtn) {
                submitBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    Notification.confirm(
                        'Submit Case Report',
                        'Are you ready to submit your case report? Your instructor will be able to review your findings and diagnosis.',
                        'Submit',
                        'Cancel',
                        function() {
                            saveReport('submitted', true);
                        }
                    );
                });
            }

            // Autosave draft silently every 25 seconds if changes occurred.
            let hasUnsavedChanges = false;
            allInputs.forEach(function(input) {
                if (input) {
                    input.addEventListener('input', function() {
                        hasUnsavedChanges = true;
                    });
                }
            });

            setInterval(function() {
                if (hasUnsavedChanges) {
                    hasUnsavedChanges = false;
                    saveReport('draft', false);
                }
            }, 25000);
        },

        /**
         * Open the Workstation Sidebar and activate a specific tab.
         *
         * @param {string} tabBtnId
         */
        openSidebarTab: function(tabBtnId) {
            const container = this.container;
            const sidebar = container.querySelector('.smartvideo-sidebar');
            if (!sidebar) {
                return;
            }
            sidebar.classList.remove('d-none');
            container.classList.add('is-sidebar-open');

            const tabBtn = sidebar.querySelector('#' + tabBtnId);
            if (tabBtn) {
                if (typeof tabBtn.click === 'function') {
                    tabBtn.click();
                }
                const activeTitleEl = sidebar.querySelector('.smartvideo-sidebar-active-tab-title');
                if (activeTitleEl) {
                    const title = (tabBtn.getAttribute('title') || '').trim();
                    if (title) {
                        activeTitleEl.textContent = title;
                    }
                }
            }

            if (this.canvas && typeof this.resizeCanvas === 'function') {
                const self = this;
                setTimeout(function() {
                    self.resizeCanvas();
                }, 60);
            }
        },

        /**
         * Submit watch progress beacon via external web service.
         */
        sendProgressBeacon: function() {
            const self = this;
            const video = this.video;

            const mergedData = mergeIntervals(this.watchedIntervals);
            this.watchedIntervals = mergedData.merged;
            this.watchedSeconds = mergedData.totalSeconds;

            const cur = Math.floor(video.currentTime || 0);
            const maxPos = Math.floor(this.maxPosition || 0);

            const request = {
                methodname: 'mod_smartvideo_update_progress',
                args: {
                    cmid: self.cmid,
                    currentposition: cur,
                    maxposition: maxPos,
                    watchedseconds: self.watchedSeconds,
                    watchedintervals: JSON.stringify(self.watchedIntervals)
                }
            };

            Ajax.call([request])[0].then(function(response) {
                if (response && response.status) {
                    const badge = self.container.querySelector('.smartvideo-progress-badge, .securevideo-progress-badge');
                    if (badge) {
                        const targetStr = self.completionMinPercent > 0 ?
                            ' (Target: ' + self.completionMinPercent + '%)' : '';
                        badge.textContent = 'Watched: ' + response.percentcompleted + '%' + targetStr;
                        if (response.iscompleted) {
                            badge.classList.remove('bg-secondary');
                            badge.classList.add('bg-success');
                        }
                    }
                }
            }).catch(function(err) {
                console.error('[SmartVideo] Progress beacon failed:', err);
            });
        },

        // =========================================================================
        // CLOSED CAPTIONS & SUBTITLES METHODS
        // =========================================================================

        /**
         * Setup Closed Captions dropdown, toggle, and language selector.
         */
        setupCaptions: function() {
            const self = this;
            const container = this.container;
            const ccMenu = container.querySelector('.smartvideo-cc-menu');
            const ccLabel = container.querySelector('.smartvideo-current-cc');
            const ccBtn = container.querySelector('.smartvideo-btn-cc');

            if (!ccMenu || !ccBtn) {
                return;
            }

            ccBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const willShow = !ccMenu.classList.contains('show');
                container.querySelectorAll('.smartvideo-controls-bar .dropdown-menu.show').forEach(function(m) {
                    m.classList.remove('show');
                });
                container.querySelectorAll('.smartvideo-controls-bar [aria-expanded="true"]').forEach(function(b) {
                    b.setAttribute('aria-expanded', 'false');
                });
                if (willShow) {
                    ccMenu.classList.add('show');
                    ccBtn.setAttribute('aria-expanded', 'true');
                }
            });

            ccMenu.addEventListener('click', function(e) {
                if (!e.target.closest('.dropdown-item')) {
                    e.stopPropagation();
                }
            });

            // Click listener for each item in the CC menu.
            ccMenu.querySelectorAll('.dropdown-item').forEach(function(item) {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const trackId = parseInt(item.dataset.trackid, 10);
                    ccMenu.querySelectorAll('.dropdown-item').forEach(function(el) {
                        el.classList.remove('active');
                    });
                    item.classList.add('active');

                    if (trackId === -1) {
                        self.captionsEnabled = false;
                        if (ccLabel) {
                            ccLabel.textContent = 'Off';
                        }
                        if (self.captionsOverlay) {
                            self.captionsOverlay.classList.add('d-none');
                        }
                    } else {
                        self.captionsEnabled = true;
                        const lang = item.dataset.lang || 'CC';
                        if (ccLabel) {
                            ccLabel.textContent = lang.toUpperCase();
                        }
                        self.activeTrackId = trackId;
                        self.loadTrackCues(trackId);
                    }

                    if (ccMenu) {
                        ccMenu.classList.remove('show');
                    }
                    if (ccBtn) {
                        ccBtn.setAttribute('aria-expanded', 'false');
                    }
                });
            });
        },

        /**
         * Load cues for a specific subtitle track via web service if needed.
         *
         * @param {number} trackId
         */
        loadTrackCues: function(trackId) {
            const self = this;
            if (trackId <= 0) {
                return;
            }
            Ajax.call([{
                methodname: 'mod_smartvideo_get_subtitles',
                args: {
                    cmid: self.cmid,
                    trackid: trackId
                }
            }])[0].then(function(res) {
                if (res && res.cues) {
                    self.cues = res.cues;
                    self.renderTranscriptCues(res.cues);
                }
            }).catch(function(err) {
                console.error('[SmartVideo] Failed to load subtitle cues:', err);
            });
        },

        /**
         * Update displayed captions on stage for the current video time.
         *
         * @param {number} cur
         */
        updateCaptions: function(cur) {
            if (!this.captionsEnabled || !this.captionsOverlay || !this.captionText) {
                return;
            }

            if (!this.cues || this.cues.length === 0) {
                this.captionsOverlay.classList.add('d-none');
                return;
            }

            let activeCue = null;
            for (let i = 0; i < this.cues.length; i++) {
                const cue = this.cues[i];
                if (cur >= cue.start && cur <= cue.end) {
                    activeCue = cue;
                    break;
                }
            }

            if (activeCue) {
                this.captionText.innerHTML = activeCue.text;
                this.captionsOverlay.classList.remove('d-none');
            } else {
                this.captionsOverlay.classList.add('d-none');
            }
        },

        // =========================================================================
        // SEARCHABLE INTERACTIVE TRANSCRIPT METHODS
        // =========================================================================

        /**
         * Setup Searchable Interactive Transcript.
         */
        setupTranscript: function() {
            const self = this;
            const searchInput = document.getElementById('svSearchTranscript');
            const transcriptList = document.getElementById('svTranscriptList');

            if (!transcriptList) {
                return;
            }

            transcriptList.addEventListener('mouseenter', function() {
                self.transcriptUserHovering = true;
            });
            transcriptList.addEventListener('mouseleave', function() {
                self.transcriptUserHovering = false;
            });

            // Click listener on cues to seek playback.
            transcriptList.addEventListener('click', function(e) {
                const cueEl = e.target.closest('.smartvideo-transcript-cue');
                if (cueEl && cueEl.dataset.start !== undefined) {
                    const start = parseFloat(cueEl.dataset.start);
                    self.video.currentTime = start;
                }
            });

            // Live filter on typing.
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    const query = searchInput.value.trim().toLowerCase();
                    const cueEls = transcriptList.querySelectorAll('.smartvideo-transcript-cue');
                    cueEls.forEach(function(el) {
                        const txt = el.querySelector('.sv-cue-text') ? el.querySelector('.sv-cue-text').textContent.toLowerCase() : '';
                        if (!query || txt.indexOf(query) !== -1) {
                            el.classList.remove('d-none');
                        } else {
                            el.classList.add('d-none');
                        }
                    });
                });
            }
        },

        /**
         * Re-render transcript cue elements when subtitle track changes.
         *
         * @param {Array<Object>} cues
         */
        renderTranscriptCues: function(cues) {
            const transcriptList = document.getElementById('svTranscriptList');
            if (!transcriptList) {
                return;
            }
            if (!cues || cues.length === 0) {
                transcriptList.innerHTML = '<div class="text-center py-4 text-white-50 small">' +
                    '<i class="fa fa-align-left fa-2x mb-2 opacity-50" aria-hidden="true"></i>' +
                    '<div>No transcript cues available.</div></div>';
                return;
            }

            let html = '';
            cues.forEach(function(cue) {
                html += '<div class="smartvideo-transcript-cue p-2 rounded cursor-pointer d-flex gap-2 align-items-start" ' +
                        'data-start="' + cue.start + '" data-end="' + cue.end + '" data-cueindex="' + cue.index + '">' +
                        '<span class="badge bg-secondary bg-opacity-75 text-white font-monospace sv-cue-time">' + cue.startformatted + '</span>' +
                        '<span class="sv-cue-text small text-white-50 flex-grow-1">' + cue.text + '</span>' +
                        '</div>';
            });
            transcriptList.innerHTML = html;
        },

        /**
         * Synchronize active transcript cue with current video playback time.
         *
         * @param {number} cur
         */
        syncTranscript: function(cur) {
            const transcriptList = document.getElementById('svTranscriptList');
            if (!transcriptList) {
                return;
            }

            const cueEls = transcriptList.querySelectorAll('.smartvideo-transcript-cue');
            let activeEl = null;

            cueEls.forEach(function(el) {
                const start = parseFloat(el.dataset.start);
                const end = parseFloat(el.dataset.end);
                if (cur >= start && cur <= end) {
                    el.classList.add('is-active');
                    activeEl = el;
                } else {
                    el.classList.remove('is-active');
                }
            });

            if (activeEl && !this.transcriptUserHovering) {
                const listRect = transcriptList.getBoundingClientRect();
                const elRect = activeEl.getBoundingClientRect();
                if (elRect.top < listRect.top || elRect.bottom > listRect.bottom) {
                    activeEl.scrollIntoView({behavior: 'smooth', block: 'nearest'});
                }
            }
        },

        // =========================================================================
        // TIMESTAMPED Q&A DISCUSSIONS METHODS
        // =========================================================================

        /**
         * Setup Timestamped Q&A Discussions across both Sidebar (Zone 2) and Below Area (Zone 3).
         */
        setupDiscussions: function() {
            const self = this;
            const container = this.container;
            const video = this.video;

            // Live sync timecode on sync buttons.
            const timeDisplays = document.querySelectorAll('.sv-qa-time-display');
            video.addEventListener('timeupdate', function() {
                const formatted = formatTime(video.currentTime);
                timeDisplays.forEach(function(el) {
                    el.textContent = formatted;
                });
            });

            // Docking triggers: from Below to Sidebar.
            document.querySelectorAll('.btn-dock-qa').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    self.openSidebarTab('tabBtnQA');
                });
            });

            document.querySelectorAll('.btn-dock-resources').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    self.openSidebarTab('tabBtnResources');
                });
            });

            // Move below triggers: from Sidebar to Below.
            document.querySelectorAll('.btn-scroll-to-below-qa').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const belowCard = document.getElementById('svBelowWorkstationCard');
                    if (belowCard) {
                        const tabBtn = document.getElementById('below-discussions-tab');
                        if (tabBtn && typeof tabBtn.click === 'function') {
                            tabBtn.click();
                        }
                        belowCard.scrollIntoView({behavior: 'smooth', block: 'start'});
                    }
                });
            });

            document.querySelectorAll('.btn-scroll-to-below-resources').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const belowCard = document.getElementById('svBelowWorkstationCard');
                    if (belowCard) {
                        const tabBtn = document.getElementById('below-resources-tab');
                        if (tabBtn && typeof tabBtn.click === 'function') {
                            tabBtn.click();
                        }
                        belowCard.scrollIntoView({behavior: 'smooth', block: 'start'});
                    }
                });
            });

            // Seek playback when clicking discussion timestamps.
            document.addEventListener('click', function(e) {
                const seekBtn = e.target.closest('.btn-seek-qa');
                if (seekBtn && seekBtn.dataset.timecode !== undefined) {
                    const timecode = parseInt(seekBtn.dataset.timecode, 10) || 0;
                    video.currentTime = timecode;
                    video.scrollIntoView({behavior: 'smooth', block: 'center'});
                }
            });

            // Toggle inline reply form.
            document.addEventListener('click', function(e) {
                const toggleReplyBtn = e.target.closest('.btn-toggle-reply');
                if (toggleReplyBtn) {
                    const replyBox = toggleReplyBtn.closest('.sv-qa-reply-box');
                    if (replyBox) {
                        const form = replyBox.querySelector('.sv-qa-reply-form');
                        if (form) {
                            form.classList.toggle('d-none');
                            const input = form.querySelector('.sv-qa-reply-input');
                            if (input && !form.classList.contains('d-none')) {
                                input.focus();
                            }
                        }
                    }
                }
            });

            // Allow Enter key to submit reply directly.
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('sv-qa-reply-input')) {
                    e.preventDefault();
                    const form = e.target.closest('.sv-qa-reply-form');
                    if (form) {
                        const btn = form.querySelector('.btn-submit-reply');
                        if (btn) {
                            btn.click();
                        }
                    }
                }
            });

            // Post Question from Sidebar.
            const postSidebarBtn = container.querySelector('.btn-post-qa-sidebar');
            const sidebarInput = container.querySelector('.sv-sidebar-qa-input');
            if (postSidebarBtn && sidebarInput) {
                postSidebarBtn.addEventListener('click', function() {
                    const content = sidebarInput.value.trim();
                    if (!content) {
                        return;
                    }
                    const includeTime = container.querySelector('#panelQA .sv-qa-include-time');
                    const timecode = (includeTime && includeTime.checked) ? Math.floor(video.currentTime) : 0;
                    postSidebarBtn.disabled = true;
                    self.postDiscussionMessage(content, timecode, 0, function() {
                        sidebarInput.value = '';
                        postSidebarBtn.disabled = false;
                    });
                });
            }

            // Post Question from Below Zone.
            const postBelowBtn = document.querySelector('.btn-post-qa-below');
            const belowInput = document.querySelector('.sv-below-qa-input');
            if (postBelowBtn && belowInput) {
                postBelowBtn.addEventListener('click', function() {
                    const content = belowInput.value.trim();
                    if (!content) {
                        return;
                    }
                    const includeTime = document.querySelector('#below-discussions .sv-qa-include-time');
                    const timecode = (includeTime && includeTime.checked) ? Math.floor(video.currentTime) : 0;
                    postBelowBtn.disabled = true;
                    self.postDiscussionMessage(content, timecode, 0, function() {
                        belowInput.value = '';
                        postBelowBtn.disabled = false;
                    });
                });
            }

            // Post Reply button click.
            document.addEventListener('click', function(e) {
                const submitReplyBtn = e.target.closest('.btn-submit-reply');
                if (submitReplyBtn) {
                    const parentId = parseInt(submitReplyBtn.dataset.parentid, 10);
                    const form = submitReplyBtn.closest('.sv-qa-reply-form');
                    const input = form ? form.querySelector('.sv-qa-reply-input') : null;
                    if (input && input.value.trim()) {
                        const content = input.value.trim();
                        submitReplyBtn.disabled = true;
                        self.postDiscussionMessage(content, 0, parentId, function() {
                            input.value = '';
                            submitReplyBtn.disabled = false;
                            form.classList.add('d-none');
                        });
                    }
                }
            });

            // Delete Discussion comment.
            document.addEventListener('click', function(e) {
                const deleteBtn = e.target.closest('.btn-delete-discussion');
                if (deleteBtn) {
                    const discussionId = parseInt(deleteBtn.dataset.discussionid, 10);
                    if (!discussionId) {
                        return;
                    }
                    Notification.confirm(
                        'Delete Discussion',
                        'Are you sure you want to delete this comment and its replies?',
                        'Delete',
                        'Cancel',
                        function() {
                            Ajax.call([{
                                methodname: 'mod_smartvideo_delete_discussion',
                                args: {
                                    cmid: self.cmid,
                                    discussionid: discussionId
                                }
                            }])[0].then(function(res) {
                                if (res && res.status) {
                                    // Remove thread or reply from both UI surfaces.
                                    document.querySelectorAll('[data-discussionid="' + discussionId + '"]').forEach(function(el) {
                                        el.remove();
                                    });
                                    // Update count badges.
                                    const badges = document.querySelectorAll('.smartvideo-qa-count-badge');
                                    badges.forEach(function(badge) {
                                        const count = Math.max(0, (parseInt(badge.textContent, 10) || 1) - 1);
                                        badge.textContent = count;
                                    });
                                }
                            }).catch(Notification.exception);
                        }
                    );
                }
            });
        },

        /**
         * Render a newly created discussion message or reply directly into the DOM without reloading.
         *
         * @param {Object} res
         */
        renderDiscussionMessage: function(res) {
            const container = this.container;
            const parentId = parseInt(res.parentid, 10) || 0;

            if (parentId === 0) {
                // New thread in Sidebar.
                const sidebarList = container.querySelector('.smartvideo-sidebar-qa-threads');
                if (sidebarList) {
                    const placeholder = sidebarList.querySelector('.sv-no-discussions-placeholder, .text-white-50.text-center');
                    if (placeholder) {
                        placeholder.remove();
                    }

                    const threadEl = document.createElement('div');
                    threadEl.className = 'card bg-black bg-opacity-30 border-secondary border-opacity-25 p-2 smartvideo-qa-thread';
                    threadEl.dataset.discussionid = res.id;

                    let timecodeBtn = '';
                    if (res.hastimecode) {
                        timecodeBtn = '<button type="button" class="btn btn-xs btn-outline-info py-0 px-1 font-monospace btn-seek-qa" data-timecode="' + res.timecode + '">' +
                            '<i class="fa fa-play fa-xs me-1"></i>' + res.timeformatted +
                        '</button>';
                    }

                    threadEl.innerHTML =
                        '<div class="d-flex justify-content-between align-items-center mb-1">' +
                            '<div class="d-flex align-items-center gap-2">' +
                                '<div class="sv-qa-avatar">' + res.userpicture + '</div>' +
                                '<span class="small fw-semibold text-white">' + res.userfullname + '</span>' +
                                timecodeBtn +
                            '</div>' +
                            '<div class="d-flex align-items-center gap-1">' +
                                '<span class="text-white-50 small" style="font-size: 0.7rem;">' + res.timecreatedformatted + '</span>' +
                                '<button type="button" class="btn btn-link text-danger p-0 ms-1 btn-delete-discussion" data-discussionid="' + res.id + '" title="Delete">' +
                                    '<i class="fa fa-trash fa-xs"></i>' +
                                '</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="small text-white-50 mb-2 qa-content-text">' + res.content + '</div>' +
                        '<div class="ps-3 border-start border-secondary border-opacity-50 ms-1 mb-2 d-flex flex-column gap-2 sv-qa-replies-container d-none"></div>' +
                        '<div class="sv-qa-reply-box mt-1">' +
                            '<button type="button" class="btn btn-xs btn-link text-white-50 p-0 text-decoration-none btn-toggle-reply">' +
                                '<i class="fa fa-reply me-1"></i>Reply' +
                            '</button>' +
                            '<div class="sv-qa-reply-form d-none mt-2">' +
                                '<div class="input-group input-group-sm">' +
                                    '<input type="text" class="form-control bg-dark text-white border-secondary sv-qa-reply-input" placeholder="Write a reply...">' +
                                    '<button class="btn btn-primary btn-submit-reply" type="button" data-parentid="' + res.id + '">' +
                                        '<i class="fa fa-paper-plane"></i>' +
                                    '</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>';

                    sidebarList.prepend(threadEl);
                }

                // New thread in Below area.
                const belowList = document.querySelector('.smartvideo-below-qa-threads');
                if (belowList) {
                    const placeholder = belowList.querySelector('.sv-no-discussions-placeholder, .text-muted.text-center');
                    if (placeholder) {
                        placeholder.remove();
                    }

                    const threadEl = document.createElement('div');
                    threadEl.className = 'card border p-3 smartvideo-qa-thread';
                    threadEl.dataset.discussionid = res.id;

                    let belowTimeBtn = '';
                    if (res.hastimecode) {
                        belowTimeBtn = '<button type="button" class="btn btn-xs btn-outline-info py-0 px-2 font-monospace btn-seek-qa ms-2" data-timecode="' + res.timecode + '">' +
                            '<i class="fa fa-play fa-xs me-1"></i>' + res.timeformatted +
                        '</button>';
                    }

                    threadEl.innerHTML =
                        '<div class="d-flex justify-content-between align-items-center mb-2">' +
                            '<div class="d-flex align-items-center gap-2">' +
                                '<div class="sv-qa-avatar">' + res.userpicture + '</div>' +
                                '<div>' +
                                    '<span class="fw-semibold text-dark">' + res.userfullname + '</span>' +
                                    '<span class="text-muted small ms-2">' + res.timecreatedformatted + '</span>' +
                                '</div>' +
                                belowTimeBtn +
                            '</div>' +
                            '<button type="button" class="btn btn-link text-danger p-0 btn-delete-discussion" data-discussionid="' + res.id + '" title="Delete">' +
                                '<i class="fa fa-trash"></i>' +
                            '</button>' +
                        '</div>' +
                        '<div class="text-dark mb-2 qa-content-text">' + res.content + '</div>' +
                        '<div class="ps-3 border-start ms-2 my-2 d-flex flex-column gap-2 sv-qa-replies-container d-none"></div>' +
                        '<div class="sv-qa-reply-box mt-1">' +
                            '<button type="button" class="btn btn-xs btn-link text-muted p-0 text-decoration-none btn-toggle-reply">' +
                                '<i class="fa fa-reply me-1"></i>Reply' +
                            '</button>' +
                            '<div class="sv-qa-reply-form d-none mt-2">' +
                                '<div class="input-group input-group-sm">' +
                                    '<input type="text" class="form-control sv-qa-reply-input" placeholder="Write a reply...">' +
                                    '<button class="btn btn-primary btn-submit-reply" type="button" data-parentid="' + res.id + '">' +
                                        '<i class="fa fa-paper-plane"></i>' +
                                    '</button>' +
                                '</div>' +
                            '</div>' +
                        '</div>';

                    belowList.prepend(threadEl);
                }
            } else {
                // New reply in Sidebar.
                const sidebarParent = container.querySelector('.smartvideo-sidebar-qa-threads [data-discussionid="' + parentId + '"]');
                if (sidebarParent) {
                    let repliesBox = sidebarParent.querySelector('.ps-3.border-start, .sv-qa-replies-container');
                    if (!repliesBox) {
                        repliesBox = document.createElement('div');
                        repliesBox.className = 'ps-3 border-start border-secondary border-opacity-50 ms-1 mb-2 d-flex flex-column gap-2 sv-qa-replies-container';
                        const replyBox = sidebarParent.querySelector('.sv-qa-reply-box');
                        if (replyBox) {
                            sidebarParent.insertBefore(repliesBox, replyBox);
                        } else {
                            sidebarParent.appendChild(repliesBox);
                        }
                    }
                    repliesBox.classList.remove('d-none');

                    const replyEl = document.createElement('div');
                    replyEl.className = 'card bg-dark bg-opacity-40 border-0 p-1 rounded';
                    replyEl.dataset.discussionid = res.id;
                    replyEl.innerHTML =
                        '<div class="d-flex justify-content-between align-items-center">' +
                            '<div class="d-flex align-items-center gap-1">' +
                                '<span class="small fw-semibold text-white">' + res.userfullname + '</span>' +
                                '<span class="text-white-50" style="font-size: 0.7rem;">' + res.timecreatedformatted + '</span>' +
                            '</div>' +
                            '<button type="button" class="btn btn-link text-danger p-0 btn-delete-discussion" data-discussionid="' + res.id + '" title="Delete">' +
                                '<i class="fa fa-trash fa-xs"></i>' +
                            '</button>' +
                        '</div>' +
                        '<div class="small text-white-50 qa-content-text">' + res.content + '</div>';

                    repliesBox.appendChild(replyEl);
                }

                // New reply in Below zone.
                const belowParent = document.querySelector('.smartvideo-below-qa-threads [data-discussionid="' + parentId + '"]');
                if (belowParent) {
                    let repliesBox = belowParent.querySelector('.ps-3.border-start, .sv-qa-replies-container');
                    if (!repliesBox) {
                        repliesBox = document.createElement('div');
                        repliesBox.className = 'ps-3 border-start ms-2 my-2 d-flex flex-column gap-2 sv-qa-replies-container';
                        const replyBox = belowParent.querySelector('.sv-qa-reply-box');
                        if (replyBox) {
                            belowParent.insertBefore(repliesBox, replyBox);
                        } else {
                            belowParent.appendChild(repliesBox);
                        }
                    }
                    repliesBox.classList.remove('d-none');

                    const replyEl = document.createElement('div');
                    replyEl.className = 'bg-light p-2 rounded';
                    replyEl.dataset.discussionid = res.id;
                    replyEl.innerHTML =
                        '<div class="d-flex justify-content-between align-items-center">' +
                            '<div class="d-flex align-items-center gap-1">' +
                                '<span class="fw-semibold small text-dark">' + res.userfullname + '</span>' +
                                '<span class="text-muted" style="font-size: 0.75rem;">' + res.timecreatedformatted + '</span>' +
                            '</div>' +
                            '<button type="button" class="btn btn-link text-danger p-0 btn-delete-discussion" data-discussionid="' + res.id + '" title="Delete">' +
                                '<i class="fa fa-trash fa-xs"></i>' +
                            '</button>' +
                        '</div>' +
                        '<div class="small text-secondary qa-content-text">' + res.content + '</div>';

                    repliesBox.appendChild(replyEl);
                }
            }

            // Update badge counts.
            document.querySelectorAll('.smartvideo-qa-count-badge').forEach(function(badge) {
                const count = (parseInt(badge.textContent, 10) || 0) + 1;
                badge.textContent = count;
            });
        },

        /**
         * Submit a new discussion question or reply via web service.
         *
         * @param {string} content
         * @param {number} timecode
         * @param {number} parentId
         * @param {Function} callback
         */
        postDiscussionMessage: function(content, timecode, parentId, callback) {
            const self = this;
            Ajax.call([{
                methodname: 'mod_smartvideo_post_discussion',
                args: {
                    cmid: self.cmid,
                    content: content,
                    timecode: timecode,
                    parentid: parentId
                }
            }])[0].then(function(res) {
                if (res && res.status) {
                    self.renderDiscussionMessage(res);
                    if (typeof callback === 'function') {
                        callback();
                    }
                }
            }).catch(Notification.exception);
        }
    };

    return {
        /**
         * Initialize player module for container.
         *
         * @param {string} containerId
         */
        init: function(containerId) {
            const container = document.getElementById(containerId) || document.getElementById('smartVideoContainer') || document.getElementById('secureVideoContainer') || document.querySelector('.smartvideo-player-container, .securevideo-player-container');
            if (container) {
                new SmartPlayer(container);
            }
        }
    };
});
