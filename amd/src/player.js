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
 * @module     mod_securevideo/player
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['core/ajax', 'core/notification'], function(Ajax, Notification) {
    'use strict';

    /**
     * Load HLS.js library locally via AMD or fallback to CDN.
     *
     * @return {Promise<window.Hls>}
     */
    function loadHls() {
        return new Promise(function(resolve, reject) {
            if (window.Hls) {
                resolve(window.Hls);
                return;
            }

            require(['local_securevideolibrary/hls'], function(HlsModule) {
                const Hls = HlsModule || window.Hls;
                if (Hls) {
                    resolve(Hls);
                    return;
                }
                loadCdn(resolve, reject);
            }, function() {
                loadCdn(resolve, reject);
            });
        });
    }

    /**
     * Fallback to CDN if local bundle is not present.
     *
     * @param {Function} resolve
     * @param {Function} reject
     */
    function loadCdn(resolve, reject) {
        if (window.Hls) {
            resolve(window.Hls);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
        script.onload = function() {
            resolve(window.Hls);
        };
        script.onerror = function(err) {
            reject(err);
        };
        document.head.appendChild(script);
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
     * Main player controller instance.
     *
     * @param {HTMLElement} container
     */
    function SecurePlayer(container) {
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
            console.error('[SecureVideo] Failed to parse questions JSON:', e, rawQuestions);
            this.questions = [];
        }

        this.questions.sort(function(a, b) {
            return (a.timecode || 0) - (b.timecode || 0);
        });

        this.video = container.querySelector('#secureVideoElement');
        this.canvas = container.querySelector('#secureVideoWatermarkCanvas');
        this.questionOverlay = container.querySelector('#secureVideoQuestionOverlay');
        this.activeQuestion = null;
        this.hls = null;
        this.beaconInterval = null;
        this.watermarkInterval = null;
        this.isScrubbing = false;

        this.init();
    }

    SecurePlayer.prototype = {
        /**
         * Initialize player.
         */
        init: function() {
            this.setupControls();
            this.setupWatermark();
            this.setupAntiTamper();
            this.setupProgressBeacon();
            this.setupQuestions();
            this.loadStream();
        },

        /**
         * Load HLS Stream into video element.
         */
        loadStream: function() {
            const self = this;
            const video = this.video;

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
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = self.playlistUrl;
                }
            }).catch(Notification.exception);
        },

        /**
         * Setup custom UI controls.
         */
        setupControls: function() {
            const self = this;
            const video = this.video;
            const container = this.container;

            const playBtn = container.querySelector('.securevideo-btn-play');
            const bigPlayBtn = container.querySelector('.securevideo-btn-bigplay');
            const centerOverlay = container.querySelector('.securevideo-center-overlay');
            const muteBtn = container.querySelector('.securevideo-btn-mute');
            const volumeSlider = container.querySelector('.securevideo-volume-slider');
            const timelineWrapper = container.querySelector('.securevideo-timeline-wrapper');
            const progressBar = container.querySelector('.securevideo-progress-bar');
            const bufferedBar = container.querySelector('.securevideo-buffered-bar');
            const maxMarker = container.querySelector('.securevideo-max-marker');
            const currentTimeEl = container.querySelector('.securevideo-current-time');
            const fullscreenBtn = container.querySelector('.securevideo-btn-fullscreen');
            const speedItems = container.querySelectorAll('.securevideo-speed-menu button');
            const resumeToast = container.querySelector('#secureVideoResumeToast');
            const seekNotice = container.querySelector('#secureVideoSeekNotice');

            // Play / Pause toggle function.
            const togglePlay = function() {
                if (self.activeQuestion) {
                    return; // Prevent play while question overlay is active.
                }
                if (video.paused || video.ended) {
                    video.play().catch(function(err) {
                        console.warn('[SecureVideo] Autoplay blocked:', err);
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
                    if (e.target === centerOverlay) {
                        togglePlay();
                    }
                });
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
            }

            // Seeking guard against native or script seek bypasses.
            video.addEventListener('seeking', function() {
                if (self.activeQuestion) {
                    return;
                }
                const cur = video.currentTime;
                // Reset triggered flag for questions ahead of current seek target.
                self.questions.forEach(function(q) {
                    if (cur < q.timecode - 1) {
                        q.triggered = false;
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

                // Update timeline progress bar.
                if (dur > 0) {
                    const percent = (cur / dur) * 100;
                    if (progressBar) {
                        progressBar.style.width = percent + '%';
                    }
                    if (maxMarker && self.preventSeeking) {
                        maxMarker.style.left = ((self.maxPosition / dur) * 100) + '%';
                    }
                }

                // Update buffered progress.
                if (video.buffered.length > 0 && dur > 0) {
                    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                    if (bufferedBar) {
                        bufferedBar.style.width = ((bufferedEnd / dur) * 100) + '%';
                    }
                }

                // Update time counter.
                if (currentTimeEl) {
                    currentTimeEl.textContent = formatTime(cur);
                }
            });

            // Playback speed selection.
            speedItems.forEach(function(item) {
                item.addEventListener('click', function() {
                    const speed = parseFloat(item.dataset.speed);
                    video.playbackRate = speed;
                    speedItems.forEach(function(b) {
                        b.classList.remove('active');
                    });
                    item.classList.add('active');
                    const label = container.querySelector('.securevideo-current-speed');
                    if (label) {
                        label.textContent = item.textContent;
                    }
                });
            });

            // Fullscreen toggle.
            if (fullscreenBtn) {
                fullscreenBtn.addEventListener('click', function() {
                    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                        if (container.requestFullscreen) {
                            container.requestFullscreen();
                        } else if (container.webkitRequestFullscreen) {
                            container.webkitRequestFullscreen();
                        }
                        fullscreenBtn.innerHTML = '<i class="fa fa-compress" aria-hidden="true"></i>';
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        }
                        fullscreenBtn.innerHTML = '<i class="fa fa-expand" aria-hidden="true"></i>';
                    }
                });
            }

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

            // Auto-hide controls when idle.
            let idleTimeout;
            const resetIdle = function() {
                container.classList.remove('is-idle');
                clearTimeout(idleTimeout);
                if (!video.paused) {
                    idleTimeout = setTimeout(function() {
                        container.classList.add('is-idle');
                    }, 3000);
                }
            };

            container.addEventListener('mousemove', resetIdle);
            container.addEventListener('click', resetIdle);
        },

        /**
         * Setup ABR Quality level options.
         *
         * @param {Array} levels
         */
        setupQualityLevels: function(levels) {
            const self = this;
            const container = this.container;
            const qualityContainer = container.querySelector('.securevideo-quality-container');
            const qualityMenu = container.querySelector('.securevideo-quality-menu');
            const qualityLabel = container.querySelector('.securevideo-current-quality');

            if (!levels || levels.length <= 1 || !qualityContainer || !qualityMenu) {
                return;
            }

            qualityContainer.classList.remove('d-none');

            levels.forEach(function(level, idx) {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dropdown-item';
                btn.dataset.level = idx;
                btn.textContent = (level.height ? level.height + 'p' : 'Level ' + (idx + 1));

                btn.addEventListener('click', function() {
                    self.hls.currentLevel = idx;
                    qualityMenu.querySelectorAll('.dropdown-item').forEach(function(b) {
                        b.classList.remove('active');
                    });
                    btn.classList.add('active');
                    if (qualityLabel) {
                        qualityLabel.textContent = btn.textContent;
                    }
                });

                li.appendChild(btn);
                qualityMenu.appendChild(li);
            });

            // Auto button.
            const autoBtn = qualityMenu.querySelector('[data-level="-1"]');
            if (autoBtn) {
                autoBtn.addEventListener('click', function() {
                    self.hls.currentLevel = -1;
                    qualityMenu.querySelectorAll('.dropdown-item').forEach(function(b) {
                        b.classList.remove('active');
                    });
                    autoBtn.classList.add('active');
                    if (qualityLabel) {
                        qualityLabel.textContent = 'Auto';
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

            const submitBtn = this.questionOverlay.querySelector('.securevideo-btn-submit');
            const continueBtn = this.questionOverlay.querySelector('.securevideo-btn-continue');
            const retryBtn = this.questionOverlay.querySelector('.securevideo-btn-retry');

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
            this.container.querySelectorAll('.securevideo-cue-marker').forEach(function(marker) {
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
            const titleEl = overlay.querySelector('.securevideo-q-title');
            const timecodeEl = overlay.querySelector('.securevideo-q-timecode');
            const loadingEl = overlay.querySelector('.securevideo-q-loading');
            const contentEl = overlay.querySelector('.securevideo-q-content');
            const feedbackEl = overlay.querySelector('.securevideo-q-feedback');
            const submitBtn = overlay.querySelector('.securevideo-btn-submit');
            const continueBtn = overlay.querySelector('.securevideo-btn-continue');
            const retryBtn = overlay.querySelector('.securevideo-btn-retry');
            const toggleStyleBtn = overlay.querySelector('.securevideo-btn-toggle-style');
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
            const bodyEl = overlay.querySelector('.securevideo-q-body');
            if (bodyEl) {
                bodyEl.scrollTop = 0;
            }

            Ajax.call([{
                methodname: 'mod_securevideo_get_question_attempt',
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
            const contentEl = overlay.querySelector('.securevideo-q-content');
            const feedbackEl = overlay.querySelector('.securevideo-q-feedback');
            const submitBtn = overlay.querySelector('.securevideo-btn-submit');
            const continueBtn = overlay.querySelector('.securevideo-btn-continue');
            const retryBtn = overlay.querySelector('.securevideo-btn-retry');
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
                methodname: 'mod_securevideo_submit_question_attempt',
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
                    const marker = self.container.querySelector('.securevideo-cue-marker[data-cueid="' + q.id + '"]');
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
                console.warn('[SecureVideo] Continue playback failed:', err);
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

            let canvas = this.container.querySelector('#secureVideoWatermarkCanvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'secureVideoWatermarkCanvas';
                canvas.className = 'securevideo-watermark-canvas position-absolute top-0 start-0 w-100 h-100';
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
                methodname: 'mod_securevideo_update_progress',
                args: {
                    cmid: self.cmid,
                    currentposition: cur,
                    maxposition: maxPos,
                    watchedseconds: self.watchedSeconds,
                    watchedintervals: JSON.stringify(self.watchedIntervals)
                }
            };

            Ajax.call([request])[0].done(function(response) {
                if (response && response.status) {
                    const badge = self.container.querySelector('.securevideo-progress-badge');
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
            }).fail(function(err) {
                console.error('[SecureVideo] Progress beacon failed:', err);
            });
        }
    };

    return {
        /**
         * Initialize player module for container.
         *
         * @param {string} containerId
         */
        init: function(containerId) {
            const container = document.getElementById(containerId);
            if (container) {
                new SecurePlayer(container);
            }
        }
    };
});
