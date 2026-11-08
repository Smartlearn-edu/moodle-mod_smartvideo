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
 * Controller for Timeline Studio authoring: interactive questions, chapters, and callout cards.
 *
 * @module     mod_smartvideo/questions
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['core/ajax', 'core/notification', 'core/str'], function(Ajax, Notification, Str) {
    'use strict';

    /**
     * Format seconds into MM:SS format.
     *
     * @param {number} totalSeconds
     * @return {string}
     */
    function formatTime(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }

    /**
     * Parse MM:SS or seconds string into integer seconds.
     *
     * @param {string|number} input
     * @return {number}
     */
    function parseTime(input) {
        if (typeof input === 'number') {
            return Math.max(0, Math.floor(input));
        }
        const str = String(input).trim();
        if (str.indexOf(':') !== -1) {
            const parts = str.split(':');
            if (parts.length === 2) {
                return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
            } else if (parts.length === 3) {
                return (parseInt(parts[0], 10) * 3600) + (parseInt(parts[1], 10) * 60) + parseInt(parts[2], 10);
            }
        }
        return Math.max(0, parseInt(str, 10) || 0);
    }

    /**
     * Get or create backdrop element for modal display.
     *
     * @return {HTMLElement}
     */
    function getOrCreateBackdrop() {
        let backdrop = document.querySelector('.smartvideo-modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop fade smartvideo-modal-backdrop';
            backdrop.style.zIndex = '1055';
            document.body.appendChild(backdrop);
        }
        return backdrop;
    }

    /**
     * Bind dismiss handlers to any modal element safely.
     *
     * @param {HTMLElement} el
     */
    function bindModalDismiss(el) {
        if (!el || el.dataset.dismissBound) {
            return;
        }
        el.dataset.dismissBound = '1';

        // Close on any dismiss button (Cancel, X, Close, etc.)
        el.querySelectorAll('[data-bs-dismiss="modal"], [data-dismiss="modal"], .btn-close, .btn-secondary, .btn-modal-close').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                hideModal(el);
            });
        });

        // Close on click outside modal dialog content
        el.addEventListener('click', function(e) {
            if (e.target === el) {
                hideModal(el);
            }
        });
    }

    /**
     * Show modal safely in any Moodle theme/environment.
     *
     * @param {HTMLElement} el
     */
    function showModal(el) {
        if (!el) {
            return;
        }

        // Always ensure dismiss listeners are bound regardless of display engine.
        bindModalDismiss(el);

        // Try jQuery / Bootstrap modal plugin if loaded.
        if (window.jQuery && typeof window.jQuery(el).modal === 'function') {
            try {
                window.jQuery(el).modal('show');
                return;
            } catch (e) {
                // Fallback to native / standalone display.
            }
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            try {
                if (typeof window.bootstrap.Modal.getOrCreateInstance === 'function') {
                    window.bootstrap.Modal.getOrCreateInstance(el).show();
                    return;
                } else if (typeof window.bootstrap.Modal === 'function') {
                    const inst = new window.bootstrap.Modal(el);
                    inst.show();
                    return;
                }
            } catch (e) {
                // Fallback to standalone display.
            }
        }

        // Bulletproof standalone fallback:
        // 1. Show backdrop
        const backdrop = getOrCreateBackdrop();
        backdrop.style.display = 'block';
        void backdrop.offsetWidth; // Force reflow
        backdrop.classList.add('show');

        // 2. Prepare modal element
        document.body.classList.add('modal-open');
        el.style.display = 'block';
        el.style.zIndex = '1060';
        el.removeAttribute('aria-hidden');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('role', 'dialog');
        void el.offsetWidth; // Force reflow for CSS opacity transition
        el.classList.add('show');
    }

    /**
     * Hide modal safely.
     *
     * @param {HTMLElement} el
     */
    function hideModal(el) {
        if (!el) {
            return;
        }

        if (window.jQuery && typeof window.jQuery(el).modal === 'function') {
            try {
                window.jQuery(el).modal('hide');
            } catch (e) {
                // Continue with manual hide.
            }
        }

        if (window.bootstrap && window.bootstrap.Modal) {
            try {
                if (typeof window.bootstrap.Modal.getInstance === 'function') {
                    const inst = window.bootstrap.Modal.getInstance(el);
                    if (inst) {
                        inst.hide();
                    }
                }
            } catch (e) {
                // Continue with manual hide.
            }
        }

        // Standalone hide:
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        el.removeAttribute('aria-modal');

        setTimeout(function() {
            el.style.display = 'none';
        }, 150);

        // Hide backdrop if no other modals are open
        const openModals = document.querySelectorAll('.modal.show');
        if (openModals.length <= 1) {
            const backdrop = document.querySelector('.smartvideo-modal-backdrop');
            if (backdrop) {
                backdrop.classList.remove('show');
                setTimeout(function() {
                    backdrop.style.display = 'none';
                }, 150);
            }
            // Remove any lingering Bootstrap modal backdrops
            document.querySelectorAll('.modal-backdrop').forEach(function(bd) {
                bd.classList.remove('show');
                setTimeout(function() {
                    if (bd.parentNode) {
                        bd.remove();
                    }
                }, 150);
            });
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
        }
    }

    // Global Escape key listener to close modals.
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                hideModal(openModal);
            }
        }
    });

    /**
     * Timeline Studio Authoring Manager.
     *
     * @param {Object} config Configuration object with cmid and duration.
     */
    function QuestionsManager(config) {
        this.cmid = config.cmid;
        this.duration = config.duration || 0;
        this.container = document.querySelector('.mod-smartvideo-questions-container') ||
                         document.querySelector('.mod-securevideo-questions-container');
        this.questionModalEl = document.getElementById('smartVideoAddQuestionModal');
        this.chapterModalEl = document.getElementById('smartVideoChapterModal');
        this.calloutModalEl = document.getElementById('smartVideoCalloutModal');
        this.subtitlesModalEl = document.getElementById('smartVideoSubtitlesModal');

        this.categories = [];
        this.currentQuestions = [];

        this.init();
    }

    QuestionsManager.prototype = {
        /**
         * Initialize events, preview player, and load categories.
         */
        init: function() {
            this.setupTabPersistence();
            this.setupPreviewPlayer();
            this.setupEventListeners();
            this.setupQuickQuestionUI();
            this.loadCategories();
        },

        /**
         * Check if web service response was successful.
         *
         * @param {Object} res
         * @return {boolean}
         */
        isSuccessResponse: function(res) {
            if (!res) {
                return false;
            }
            if (res.status === true || res.success === true) {
                return true;
            }
            if ((res.id !== undefined && res.id > 0) || (res.cueid !== undefined && res.cueid > 0)) {
                return true;
            }
            return (res.status !== false && res.success !== false);
        },

        /**
         * Set active tab in sessionStorage and URL hash so it persists across page reloads.
         *
         * @param {string} tabTarget E.g. '#tab-chapters'
         */
        setActiveTab: function(tabTarget) {
            if (!tabTarget) {
                return;
            }
            try {
                sessionStorage.setItem('smartvideo_active_tab_' + this.cmid, tabTarget);
            } catch (e) {}
            try {
                window.location.hash = tabTarget;
            } catch (e) {}
        },

        /**
         * Setup tab switching persistence so the user stays on the right tab after reload.
         */
        setupTabPersistence: function() {
            const self = this;
            const root = this.container || document;

            // Track tab changes and save in sessionStorage and URL hash.
            root.querySelectorAll('#timelineStudioTabs button[data-bs-toggle="tab"], #timelineStudioTabs a[data-bs-toggle="tab"]').forEach(function(btn) {
                btn.addEventListener('shown.bs.tab', function(e) {
                    const target = e.target.getAttribute('data-bs-target') || e.target.getAttribute('href');
                    if (target) {
                        self.setActiveTab(target);
                    }
                });
            });

            // Restore active tab from location hash or sessionStorage.
            let activeTab = null;
            if (window.location.hash && window.location.hash.startsWith('#tab-')) {
                activeTab = window.location.hash;
            } else {
                try {
                    activeTab = sessionStorage.getItem('smartvideo_active_tab_' + self.cmid);
                } catch (e) {}
            }

            if (activeTab) {
                const targetBtn = root.querySelector('#timelineStudioTabs button[data-bs-target="' + activeTab + '"]') ||
                                  root.querySelector('#timelineStudioTabs a[href="' + activeTab + '"]');
                if (targetBtn) {
                    if (window.bootstrap && window.bootstrap.Tab) {
                        try {
                            const tab = (typeof window.bootstrap.Tab.getOrCreateInstance === 'function') ?
                                window.bootstrap.Tab.getOrCreateInstance(targetBtn) : new window.bootstrap.Tab(targetBtn);
                            tab.show();
                        } catch (e) {}
                    } else if (window.jQuery && typeof window.jQuery(targetBtn).tab === 'function') {
                        try {
                            window.jQuery(targetBtn).tab('show');
                        } catch (e) {}
                    }
                }
            }
        },

        /**
         * Setup mini video preview player and timeline scrubber.
         */
        setupPreviewPlayer: function() {
            const self = this;
            const video = document.getElementById('smartVideoPreviewElement');
            const scrubInput = document.getElementById('smartVideoScrubTimeInput');
            const timerBadge = this.container.querySelector('.smartvideo-preview-timer, .securevideo-preview-timer');

            if (!video) {
                return;
            }

            // HLS stream loader if available.
            require(['local_securevideolibrary/hls-lazy'], function(Hls) {
                const HlsClass = Hls || window.Hls;
                const containerData = document.getElementById('smartVideoContainer') ||
                                      document.getElementById('secureVideoContainer') ||
                                      self.container;
                const playlistUrl = containerData ? containerData.dataset.playlisturl : null;

                if (playlistUrl && HlsClass && HlsClass.isSupported()) {
                    const hls = new HlsClass({debug: false});
                    hls.loadSource(playlistUrl);
                    hls.attachMedia(video);
                }
            }, function() {
                // Native playback fallback.
            });

            // Sync video playback to time badge and scrub input (only if user is not currently typing in it).
            video.addEventListener('timeupdate', function() {
                const formatted = formatTime(video.currentTime);
                if (scrubInput && document.activeElement !== scrubInput) {
                    scrubInput.value = formatted;
                }
                if (timerBadge) {
                    timerBadge.textContent = formatted + ' / ' + formatTime(self.duration);
                }
            });

            // When user manually types or changes the time in the scrub input box.
            if (scrubInput) {
                const syncTimeFromInput = function() {
                    const secs = parseTime(scrubInput.value);
                    scrubInput.value = formatTime(secs);
                    if (video) {
                        video.currentTime = (self.duration > 0) ? Math.min(secs, self.duration) : secs;
                    }
                };

                scrubInput.addEventListener('change', syncTimeFromInput);
                scrubInput.addEventListener('blur', syncTimeFromInput);
                scrubInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        syncTimeFromInput();
                        scrubInput.blur();
                    }
                });
            }
        },

        /**
         * Setup Quick Question choices list and type switcher.
         */
        setupQuickQuestionUI: function() {
            const qtypeSelect = document.getElementById('quickQtype');
            const mcSection = document.getElementById('quickMultichoiceSection');
            const tfSection = document.getElementById('quickTruefalseSection');
            const choicesList = document.getElementById('quickChoicesList');
            const addChoiceBtn = document.getElementById('btnAddQuickChoice');

            if (qtypeSelect && mcSection && tfSection) {
                qtypeSelect.addEventListener('change', function() {
                    if (qtypeSelect.value === 'truefalse') {
                        mcSection.classList.add('d-none');
                        tfSection.classList.remove('d-none');
                    } else {
                        mcSection.classList.remove('d-none');
                        tfSection.classList.add('d-none');
                    }
                });
            }

            if (choicesList) {
                this.renderDefaultQuickChoices(choicesList);
            }

            if (addChoiceBtn && choicesList) {
                const self = this;
                addChoiceBtn.addEventListener('click', function() {
                    const count = choicesList.querySelectorAll('.quick-choice-row').length + 1;
                    self.addQuickChoiceRow(choicesList, '', 'Choice ' + count, false);
                });
            }
        },

        /**
         * Render default 4 choices for multiple choice quick creator.
         *
         * @param {HTMLElement} container
         */
        renderDefaultQuickChoices: function(container) {
            container.innerHTML = '';
            for (let i = 1; i <= 4; i++) {
                this.addQuickChoiceRow(container, '', 'Choice ' + i, i === 1);
            }
        },

        /**
         * Add a single choice row to the multiple choice quick creator.
         *
         * @param {HTMLElement} container
         * @param {string} value
         * @param {string} placeholder
         * @param {boolean} isChecked
         */
        addQuickChoiceRow: function(container, value, placeholder, isChecked) {
            const row = document.createElement('div');
            row.className = 'input-group quick-choice-row';
            const checkedAttr = isChecked ? 'checked' : '';
            row.innerHTML =
                '<div class="input-group-text bg-light">' +
                    '<input class="form-check-input mt-0 quick-choice-radio" type="radio" name="quickChoiceCorrect" title="Mark as correct answer" ' + checkedAttr + '>' +
                '</div>' +
                '<input type="text" class="form-control quick-choice-input" placeholder="' + (placeholder || 'Choice text') + '" value="' + (value || '') + '">' +
                '<button type="button" class="btn btn-outline-danger btn-remove-choice" title="Remove choice">' +
                    '<i class="fa fa-times" aria-hidden="true"></i>' +
                '</button>';
            container.appendChild(row);

            row.querySelector('.btn-remove-choice').addEventListener('click', function() {
                if (container.querySelectorAll('.quick-choice-row').length > 2) {
                    row.remove();
                } else {
                    Notification.alert('Notice', 'A multiple choice question must contain at least 2 choices.', 'OK');
                }
            });
        },

        /**
         * Setup button clicks and modal events for Questions, Chapters, and Callouts.
         */
        setupEventListeners: function() {
            const self = this;
            const root = this.container || document;
            const video = document.getElementById('smartVideoPreviewElement');

            // Pre-bind dismiss on all 4 modals to ensure Cancel/X buttons always work.
            bindModalDismiss(this.questionModalEl || document.getElementById('smartVideoAddQuestionModal'));
            bindModalDismiss(this.chapterModalEl || document.getElementById('smartVideoChapterModal'));
            bindModalDismiss(this.calloutModalEl || document.getElementById('smartVideoCalloutModal'));
            bindModalDismiss(this.subtitlesModalEl || document.getElementById('smartVideoSubtitlesModal'));

            // --- Jump to time button in all tables ---
            root.querySelectorAll('.btn-jump-to-time').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const timecode = parseInt(btn.dataset.timecode, 10) || 0;
                    if (video) {
                        video.currentTime = timecode;
                        video.scrollIntoView({behavior: 'smooth', block: 'center'});
                    }
                });
            });

            // Helper to get timecode from user-typed input or current video time.
            const getCurrentScrubTime = function() {
                const scrubInput = document.getElementById('smartVideoScrubTimeInput');
                if (scrubInput && scrubInput.value) {
                    const typed = parseTime(scrubInput.value);
                    if (typed > 0 || (video && video.currentTime === 0)) {
                        return typed;
                    }
                }
                return video ? Math.floor(video.currentTime) : 0;
            };

            // --- Question Event Listeners ---
            root.querySelectorAll('.btn-add-question').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openQuestionModalForAdd(btn.dataset.timecode || 0);
                });
            });

            const addQuestionAtCurrentBtn = root.querySelector('.btn-add-at-current');
            if (addQuestionAtCurrentBtn) {
                addQuestionAtCurrentBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openQuestionModalForAdd(getCurrentScrubTime());
                });
            }

            root.querySelectorAll('.btn-edit-cue').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openQuestionModalForEdit(row);
                });
            });

            root.querySelectorAll('.btn-delete-cue').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const cueId = parseInt(row.dataset.cueid, 10);
                    self.deleteQuestionCue(cueId, row);
                });
            });

            const catSelect = document.getElementById('cueCategorySelect');
            if (catSelect) {
                catSelect.addEventListener('change', function() {
                    self.onCategoryChange(parseInt(catSelect.value, 10));
                });
            }

            const qSelect = document.getElementById('cueQuestionSelect');
            if (qSelect) {
                qSelect.addEventListener('change', function() {
                    self.onQuestionChange(parseInt(qSelect.value, 10));
                });
            }

            const questionModal = this.questionModalEl || document.getElementById('smartVideoAddQuestionModal');
            if (questionModal) {
                const saveQuestionBtn = questionModal.querySelector('.btn-save-cue');
                if (saveQuestionBtn) {
                    saveQuestionBtn.addEventListener('click', function() {
                        self.saveQuestion();
                    });
                }
            }

            // --- Chapter Event Listeners ---
            root.querySelectorAll('.btn-add-chapter').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openChapterModalForAdd(btn.dataset.timecode || 0);
                });
            });

            const addChapterAtCurrentBtn = root.querySelector('.btn-add-chapter-at-current');
            if (addChapterAtCurrentBtn) {
                addChapterAtCurrentBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openChapterModalForAdd(getCurrentScrubTime());
                });
            }

            root.querySelectorAll('.btn-edit-chapter').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openChapterModalForEdit(row);
                });
            });

            root.querySelectorAll('.btn-delete-chapter').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const chapterId = parseInt(row.dataset.chapterid, 10);
                    self.deleteChapter(chapterId, row);
                });
            });

            const chapterModal = this.chapterModalEl || document.getElementById('smartVideoChapterModal');
            if (chapterModal) {
                const saveChapterBtn = chapterModal.querySelector('.btn-save-chapter');
                if (saveChapterBtn) {
                    saveChapterBtn.addEventListener('click', function() {
                        self.saveChapter();
                    });
                }
            }

            // --- Callout Event Listeners ---
            root.querySelectorAll('.btn-add-callout').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openCalloutModalForAdd(btn.dataset.timecode || 0);
                });
            });

            const addCalloutAtCurrentBtn = root.querySelector('.btn-add-callout-at-current');
            if (addCalloutAtCurrentBtn) {
                addCalloutAtCurrentBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openCalloutModalForAdd(getCurrentScrubTime());
                });
            }

            root.querySelectorAll('.btn-edit-callout').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openCalloutModalForEdit(row);
                });
            });

            root.querySelectorAll('.btn-delete-callout').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const calloutId = parseInt(row.dataset.calloutid, 10);
                    self.deleteCallout(calloutId, row);
                });
            });

            const calloutModal = this.calloutModalEl || document.getElementById('smartVideoCalloutModal');
            if (calloutModal) {
                const saveCalloutBtn = calloutModal.querySelector('.btn-save-callout');
                if (saveCalloutBtn) {
                    saveCalloutBtn.addEventListener('click', function() {
                        self.saveCallout();
                    });
                }
            }

            // --- Subtitles Event Listeners ---
            root.querySelectorAll('.btn-add-subtitles').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openSubtitlesModalForAdd();
                });
            });

            root.querySelectorAll('.btn-edit-subtitles').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openSubtitlesModalForEdit(row);
                });
            });

            root.querySelectorAll('.btn-delete-subtitles').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const trackId = parseInt(row.dataset.trackid, 10);
                    self.deleteSubtitles(trackId, row);
                });
            });

            const subLangSelect = document.getElementById('subLang');
            const subLabelInput = document.getElementById('subLabel');
            if (subLangSelect && subLabelInput) {
                const langLabels = {
                    'en': 'English',
                    'ar': 'العربية',
                    'fr': 'Français',
                    'es': 'Español',
                    'de': 'Deutsch',
                    'it': 'Italiano',
                    'pt': 'Português',
                    'tr': 'Türkçe',
                    'zh': '中文'
                };
                subLangSelect.addEventListener('change', function() {
                    const selectedVal = subLangSelect.value;
                    if (langLabels[selectedVal]) {
                        subLabelInput.value = langLabels[selectedVal];
                    }
                });
            }

            const subtitlesModal = this.subtitlesModalEl || document.getElementById('smartVideoSubtitlesModal');
            if (subtitlesModal) {
                const saveSubtitlesBtn = subtitlesModal.querySelector('.btn-save-subtitles');
                if (saveSubtitlesBtn) {
                    saveSubtitlesBtn.addEventListener('click', function() {
                        self.saveSubtitles();
                    });
                }
            }
        },

        /**
         * Load course question categories via web service.
         */
        loadCategories: function() {
            const self = this;
            const catSelect = document.getElementById('cueCategorySelect');
            const quickCatSelect = document.getElementById('quickCategorySelect');

            Ajax.call([{
                methodname: 'mod_smartvideo_get_course_categories',
                args: {cmid: self.cmid}
            }])[0].then(function(categories) {
                self.categories = categories || [];
                if (catSelect) {
                    catSelect.innerHTML = '<option value="">Choose a category...</option>';
                    self.categories.forEach(function(cat) {
                        const opt = document.createElement('option');
                        opt.value = cat.id;
                        opt.textContent = cat.displayname;
                        catSelect.appendChild(opt);
                    });
                }
                if (quickCatSelect) {
                    quickCatSelect.innerHTML = '<option value="0">Default Category (Auto)</option>';
                    self.categories.forEach(function(cat) {
                        const opt = document.createElement('option');
                        opt.value = cat.id;
                        opt.textContent = cat.displayname;
                        quickCatSelect.appendChild(opt);
                    });
                }
            }).catch(Notification.exception);
        },

        /**
         * When category is changed, fetch its ready questions.
         *
         * @param {number} categoryId
         * @param {number} preselectQid Optional question ID to preselect.
         */
        onCategoryChange: function(categoryId, preselectQid) {
            const self = this;
            const qSelect = document.getElementById('cueQuestionSelect');
            const previewBox = document.getElementById('cueQuestionPreviewBox');

            if (!categoryId || categoryId <= 0) {
                if (qSelect) {
                    qSelect.innerHTML = '<option value="">Choose a question...</option>';
                    qSelect.disabled = true;
                }
                if (previewBox) {
                    previewBox.classList.add('d-none');
                }
                return;
            }

            if (qSelect) {
                qSelect.disabled = true;
                qSelect.innerHTML = '<option value="">Loading questions...</option>';
            }

            Ajax.call([{
                methodname: 'mod_smartvideo_get_category_questions',
                args: {cmid: self.cmid, categoryid: categoryId}
            }])[0].then(function(questions) {
                self.currentQuestions = questions || [];
                if (!qSelect) {
                    return;
                }

                qSelect.innerHTML = '<option value="">Choose a question...</option>';

                if (self.currentQuestions.length === 0) {
                    qSelect.innerHTML = '<option value="">No ready questions in this category</option>';
                    qSelect.disabled = true;
                    return;
                }

                self.currentQuestions.forEach(function(q) {
                    const opt = document.createElement('option');
                    opt.value = q.id;
                    opt.dataset.qbeid = q.questionbankentryid;
                    opt.textContent = q.name + ' (' + q.qtype + ')';
                    qSelect.appendChild(opt);
                });

                qSelect.disabled = false;

                if (preselectQid) {
                    qSelect.value = preselectQid;
                    self.onQuestionChange(preselectQid);
                }
            }).catch(Notification.exception);
        },

        /**
         * When a question is selected in the Question Bank sub-tab, show preview.
         *
         * @param {number} questionId
         */
        onQuestionChange: function(questionId) {
            const previewBox = document.getElementById('cueQuestionPreviewBox');
            const previewQname = document.getElementById('previewQname');
            const previewQtype = document.getElementById('previewQtype');
            const previewQtext = document.getElementById('previewQtext');
            const qbeIdInput = document.getElementById('cueQbeId');

            if (!questionId || questionId <= 0) {
                if (previewBox) {
                    previewBox.classList.add('d-none');
                }
                return;
            }

            const q = this.currentQuestions.find(function(item) {
                return item.id === questionId;
            });

            if (!q) {
                return;
            }

            if (qbeIdInput) {
                qbeIdInput.value = q.questionbankentryid || 0;
            }

            if (previewBox && previewQname && previewQtype && previewQtext) {
                previewQname.textContent = q.name;
                previewQtype.textContent = q.qtype;
                previewQtext.textContent = q.preview || '';
                previewBox.classList.remove('d-none');
            }
        },

        /**
         * Open modal to add a new question cuepoint.
         *
         * @param {number|string} initialTimecode
         */
        openQuestionModalForAdd: function(initialTimecode) {
            const modalEl = this.questionModalEl || document.getElementById('smartVideoAddQuestionModal');
            if (!modalEl) {
                return;
            }

            const cueIdInput = document.getElementById('cueId');
            if (cueIdInput) cueIdInput.value = '0';
            const cueQidInput = document.getElementById('cueQid');
            if (cueQidInput) cueQidInput.value = '0';
            const cueQbeIdInput = document.getElementById('cueQbeId');
            if (cueQbeIdInput) cueQbeIdInput.value = '0';
            const cueTimecodeInput = document.getElementById('cueTimecode');
            if (cueTimecodeInput) cueTimecodeInput.value = formatTime(parseTime(initialTimecode));
            const cueTitleInput = document.getElementById('cueTitle');
            if (cueTitleInput) cueTitleInput.value = '';
            const cueCatSelect = document.getElementById('cueCategorySelect');
            if (cueCatSelect) cueCatSelect.value = '';

            const qSelect = document.getElementById('cueQuestionSelect');
            if (qSelect) {
                qSelect.innerHTML = '<option value="">Choose a question...</option>';
                qSelect.disabled = true;
            }

            const previewBox = document.getElementById('cueQuestionPreviewBox');
            if (previewBox) {
                previewBox.classList.add('d-none');
            }

            // Reset Quick Creator fields
            const quickText = document.getElementById('quickQuestionText');
            if (quickText) {
                quickText.value = '';
            }
            const qtypeSelect = document.getElementById('quickQtype');
            if (qtypeSelect) {
                qtypeSelect.value = 'multichoice';
                qtypeSelect.dispatchEvent(new Event('change'));
            }
            const choicesList = document.getElementById('quickChoicesList');
            if (choicesList) {
                this.renderDefaultQuickChoices(choicesList);
            }

            const cueReqInput = document.getElementById('cueRequireCorrect');
            if (cueReqInput) cueReqInput.checked = true;
            const cueRewindInput = document.getElementById('cueRewindTo');
            if (cueRewindInput) cueRewindInput.value = '';
            const styleSelect = document.getElementById('cueQuestionStyle');
            if (styleSelect) {
                styleSelect.value = 'compact';
            }

            // Default to Question Bank tab
            const bankTabBtn = document.getElementById('source-bank-tab');
            if (bankTabBtn && window.bootstrap && window.bootstrap.Tab) {
                try {
                    const tab = (typeof window.bootstrap.Tab.getOrCreateInstance === 'function') ?
                        window.bootstrap.Tab.getOrCreateInstance(bankTabBtn) : new window.bootstrap.Tab(bankTabBtn);
                    tab.show();
                } catch (e) {
                    // Ignore tab show error
                }
            }

            const titleText = modalEl.querySelector('.modal-title-text');
            if (titleText) {
                titleText.textContent = 'Add Interactive Question';
            }
            showModal(modalEl);
        },

        /**
         * Open modal to edit an existing question cuepoint.
         *
         * @param {HTMLElement} row
         */
        openQuestionModalForEdit: function(row) {
            const modalEl = this.questionModalEl || document.getElementById('smartVideoAddQuestionModal');
            if (!modalEl || !row) {
                return;
            }

            const cueId = row.dataset.cueid || '0';
            const timecode = parseInt(row.dataset.timecode, 10) || 0;
            const qid = parseInt(row.dataset.qid, 10) || 0;
            const qbeId = parseInt(row.dataset.qbeid, 10) || 0;
            const title = row.dataset.title || '';
            const req = row.dataset.req === '1';
            const rewindTo = (row.dataset.rewindto !== undefined && row.dataset.rewindto !== '') ?
                parseInt(row.dataset.rewindto, 10) : -1;

            const cueIdInput = document.getElementById('cueId');
            if (cueIdInput) cueIdInput.value = cueId;
            const cueQidInput = document.getElementById('cueQid');
            if (cueQidInput) cueQidInput.value = qid;
            const cueQbeIdInput = document.getElementById('cueQbeId');
            if (cueQbeIdInput) cueQbeIdInput.value = qbeId;
            const cueTimecodeInput = document.getElementById('cueTimecode');
            if (cueTimecodeInput) cueTimecodeInput.value = formatTime(timecode);
            const cueTitleInput = document.getElementById('cueTitle');
            if (cueTitleInput) cueTitleInput.value = title;
            const cueReqInput = document.getElementById('cueRequireCorrect');
            if (cueReqInput) cueReqInput.checked = req;
            const cueRewindInput = document.getElementById('cueRewindTo');
            if (cueRewindInput) cueRewindInput.value = (rewindTo >= 0) ? formatTime(rewindTo) : '';
            const styleSelect = document.getElementById('cueQuestionStyle');
            if (styleSelect) {
                styleSelect.value = row.dataset.style || 'compact';
            }

            // When editing an existing cuepoint, activate Question Bank tab
            const bankTabBtn = document.getElementById('source-bank-tab');
            if (bankTabBtn && window.bootstrap && window.bootstrap.Tab) {
                try {
                    const tab = (typeof window.bootstrap.Tab.getOrCreateInstance === 'function') ?
                        window.bootstrap.Tab.getOrCreateInstance(bankTabBtn) : new window.bootstrap.Tab(bankTabBtn);
                    tab.show();
                } catch (e) {
                    // Ignore tab show error
                }
            }

            const titleText = modalEl.querySelector('.modal-title-text');
            if (titleText) {
                titleText.textContent = 'Edit Interactive Question';
            }
            showModal(modalEl);
        },

        /**
         * Save question (handles both Question Bank linking and Quick Creator).
         */
        saveQuestion: function() {
            const self = this;
            const cueId = parseInt(document.getElementById('cueId').value, 10) || 0;
            const timecode = parseTime(document.getElementById('cueTimecode').value);
            const title = document.getElementById('cueTitle').value.trim();
            const requireCorrect = document.getElementById('cueRequireCorrect').checked ? 1 : 0;
            const styleSelect = document.getElementById('cueQuestionStyle');
            const questionStyle = styleSelect ? styleSelect.value : 'compact';

            const rewindToRaw = document.getElementById('cueRewindTo').value.trim();
            let rewindTo = -1;
            if (rewindToRaw !== '' && rewindToRaw !== '-' && rewindToRaw !== '-1') {
                rewindTo = parseTime(rewindToRaw);
                if (rewindTo > timecode) {
                    Notification.alert(
                        'Invalid Rewind Time',
                        'The time to go to on wrong answer (' + formatTime(rewindTo) +
                        ') cannot be after the question time (' + formatTime(timecode) + ').',
                        'OK'
                    );
                    return;
                }
            }

            if (self.duration > 0 && timecode > self.duration) {
                Notification.alert(
                    'Invalid Timestamp',
                    'Timestamp cannot exceed video duration (' + formatTime(self.duration) + ').',
                    'OK'
                );
                return;
            }

            // Determine active sub-tab: Question Bank vs Quick Creator
            const quickTabPane = document.getElementById('source-quick');
            const isQuickCreator = quickTabPane && quickTabPane.classList.contains('active') && (cueId === 0);

            if (isQuickCreator) {
                // Save via mod_smartvideo_create_quick_question
                const qtypeSelect = document.getElementById('quickQtype');
                const qtype = qtypeSelect ? qtypeSelect.value : 'multichoice';
                const questionText = (document.getElementById('quickQuestionText').value || '').trim();
                const quickCatSelect = document.getElementById('quickCategorySelect');
                const categoryId = quickCatSelect ? (parseInt(quickCatSelect.value, 10) || 0) : 0;

                if (!questionText) {
                    Notification.alert('Required Field', 'Please enter a question prompt.', 'OK');
                    return;
                }

                let choices = [];
                let correctIndex = 0;

                if (qtype === 'multichoice') {
                    const rows = quickTabPane.querySelectorAll('.quick-choice-row');
                    let checkedFound = false;

                    rows.forEach(function(r) {
                        const txt = (r.querySelector('.quick-choice-input').value || '').trim();
                        if (txt) {
                            const isRadioChecked = r.querySelector('.quick-choice-radio').checked;
                            if (isRadioChecked) {
                                correctIndex = choices.length;
                                checkedFound = true;
                            }
                            choices.push(txt);
                        }
                    });

                    if (choices.length < 2) {
                        Notification.alert('Validation Error', 'Please provide at least 2 non-empty choices.', 'OK');
                        return;
                    }
                    if (!checkedFound) {
                        correctIndex = 0;
                    }
                } else {
                    // True / False
                    choices = ['True', 'False'];
                    const tfTrue = document.getElementById('quickTfTrue');
                    correctIndex = (tfTrue && tfTrue.checked) ? 0 : 1;
                }

                const modalEl = self.questionModalEl || document.getElementById('smartVideoAddQuestionModal');
                const saveBtn = modalEl ? modalEl.querySelector('.btn-save-cue') : null;
                if (saveBtn) {
                    saveBtn.disabled = true;
                }

                Ajax.call([{
                    methodname: 'mod_smartvideo_create_quick_question',
                    args: {
                        cmid: self.cmid,
                        categoryid: categoryId,
                        timecode: timecode,
                        qtype: qtype,
                        title: title || 'Knowledge Check',
                        questiontext: questionText,
                        choices: choices,
                        correctindex: correctIndex,
                        requirecorrect: requireCorrect,
                        rewindonfail: 0,
                        rewindto: rewindTo,
                        questionstyle: questionStyle
                    }
                }])[0].then(function(res) {
                    if (self.isSuccessResponse(res)) {
                        hideModal(modalEl);
                        self.setActiveTab('#tab-questions');
                        window.location.reload();
                    } else {
                        if (saveBtn) saveBtn.disabled = false;
                    }
                }).catch(function(err) {
                    if (saveBtn) saveBtn.disabled = false;
                    Notification.exception(err);
                });

            } else {
                // Save via mod_smartvideo_save_cuepoint
                let qbeId = parseInt(document.getElementById('cueQbeId').value, 10) || 0;
                const qSelect = document.getElementById('cueQuestionSelect');
                let qid = parseInt(qSelect.value, 10) || 0;
                if (qid <= 0) {
                    qid = parseInt(document.getElementById('cueQid').value, 10) || 0;
                }
                if (qbeId <= 0 && qSelect.selectedOptions && qSelect.selectedOptions[0]) {
                    qbeId = parseInt(qSelect.selectedOptions[0].dataset.qbeid, 10) || 0;
                }

                if (qid <= 0 && qbeId <= 0 && cueId <= 0) {
                    Notification.alert('Error', 'Please select a question from the Question Bank.', 'OK');
                    return;
                }

                const modalEl = self.questionModalEl || document.getElementById('smartVideoAddQuestionModal');
                const saveBtn = modalEl ? modalEl.querySelector('.btn-save-cue') : null;
                if (saveBtn) {
                    saveBtn.disabled = true;
                }

                Ajax.call([{
                    methodname: 'mod_smartvideo_save_cuepoint',
                    args: {
                        cmid: self.cmid,
                        cueid: cueId,
                        questionbankentryid: qbeId,
                        questionid: qid,
                        timecode: timecode,
                        title: title,
                        requirecorrect: requireCorrect,
                        rewindonfail: 0,
                        rewindto: rewindTo,
                        questionstyle: questionStyle
                    }
                }])[0].then(function(res) {
                    if (self.isSuccessResponse(res)) {
                        hideModal(modalEl);
                        self.setActiveTab('#tab-questions');
                        window.location.reload();
                    } else {
                        if (saveBtn) saveBtn.disabled = false;
                    }
                }).catch(function(err) {
                    if (saveBtn) saveBtn.disabled = false;
                    Notification.exception(err);
                });
            }
        },

        /**
         * Delete question cuepoint.
         *
         * @param {number} cueId
         * @param {HTMLElement} row
         */
        deleteQuestionCue: function(cueId, row) {
            const self = this;
            Str.get_string('deletequestionconfirm', 'mod_smartvideo').then(function(msg) {
                Notification.confirm('Delete Question', msg, 'Delete', 'Cancel', function() {
                    Ajax.call([{
                        methodname: 'mod_smartvideo_delete_cuepoint',
                        args: {
                            cmid: self.cmid,
                            cueid: cueId
                        }
                    }])[0].then(function(res) {
                        if (self.isSuccessResponse(res)) {
                            row.remove();
                            self.setActiveTab('#tab-questions');
                            window.location.reload();
                        }
                    }).catch(Notification.exception);
                });
            });
        },

        // =========================================================================
        // CHAPTER MARKER METHODS
        // =========================================================================

        /**
         * Open modal to add a new chapter.
         *
         * @param {number|string} initialTimecode
         */
        openChapterModalForAdd: function(initialTimecode) {
            const modalEl = this.chapterModalEl || document.getElementById('smartVideoChapterModal');
            if (!modalEl) {
                return;
            }

            const idField = document.getElementById('chapterId');
            if (idField) idField.value = '0';
            const tcField = document.getElementById('chapterTimecode');
            if (tcField) tcField.value = formatTime(parseTime(initialTimecode));
            const titleField = document.getElementById('chapterTitle');
            if (titleField) titleField.value = '';

            const titleText = modalEl.querySelector('.chapter-modal-title-text');
            if (titleText) {
                titleText.textContent = 'Add Chapter';
            }
            showModal(modalEl);
        },

        /**
         * Open modal to edit an existing chapter.
         *
         * @param {HTMLElement} row
         */
        openChapterModalForEdit: function(row) {
            const modalEl = this.chapterModalEl || document.getElementById('smartVideoChapterModal');
            if (!modalEl || !row) {
                return;
            }

            const chapterId = row.dataset.chapterid || '0';
            const timecode = parseInt(row.dataset.timecode, 10) || 0;
            const title = row.dataset.title || '';

            const idField = document.getElementById('chapterId');
            if (idField) idField.value = chapterId;
            const tcField = document.getElementById('chapterTimecode');
            if (tcField) tcField.value = formatTime(timecode);
            const titleField = document.getElementById('chapterTitle');
            if (titleField) titleField.value = title;

            const titleText = modalEl.querySelector('.chapter-modal-title-text');
            if (titleText) {
                titleText.textContent = 'Edit Chapter';
            }
            showModal(modalEl);
        },

        /**
         * Save chapter via web service.
         */
        saveChapter: function() {
            const self = this;
            const idField = document.getElementById('chapterId');
            const tcField = document.getElementById('chapterTimecode');
            const titleField = document.getElementById('chapterTitle');

            const chapterId = idField ? (parseInt(idField.value, 10) || 0) : 0;
            const timecode = tcField ? parseTime(tcField.value) : 0;
            const title = titleField ? (titleField.value || '').trim() : '';

            if (!title) {
                Notification.alert('Validation Error', 'Chapter title cannot be empty.', 'OK');
                return;
            }

            if (self.duration > 0 && timecode > self.duration) {
                Notification.alert(
                    'Invalid Timestamp',
                    'Chapter timestamp cannot exceed video duration (' + formatTime(self.duration) + ').',
                    'OK'
                );
                return;
            }

            const modalEl = self.chapterModalEl || document.getElementById('smartVideoChapterModal');
            const saveBtn = modalEl ? modalEl.querySelector('.btn-save-chapter') : null;
            if (saveBtn) {
                saveBtn.disabled = true;
            }

            Ajax.call([{
                methodname: 'mod_smartvideo_save_chapter',
                args: {
                    cmid: self.cmid,
                    chapterid: chapterId,
                    timecode: timecode,
                    title: title
                }
            }])[0].then(function(res) {
                if (self.isSuccessResponse(res)) {
                    hideModal(modalEl);
                    self.setActiveTab('#tab-chapters');
                    window.location.reload();
                } else {
                    if (saveBtn) saveBtn.disabled = false;
                }
            }).catch(function(err) {
                if (saveBtn) saveBtn.disabled = false;
                Notification.exception(err);
            });
        },

        /**
         * Delete chapter with confirmation.
         *
         * @param {number} chapterId
         * @param {HTMLElement} row
         */
        deleteChapter: function(chapterId, row) {
            const self = this;
            Str.get_string('deletechapterconfirm', 'mod_smartvideo').then(function(msg) {
                Notification.confirm('Delete Chapter', msg, 'Delete', 'Cancel', function() {
                    Ajax.call([{
                        methodname: 'mod_smartvideo_delete_chapter',
                        args: {
                            cmid: self.cmid,
                            chapterid: chapterId
                        }
                    }])[0].then(function(res) {
                        if (self.isSuccessResponse(res)) {
                            row.remove();
                            self.setActiveTab('#tab-chapters');
                            window.location.reload();
                        }
                    }).catch(Notification.exception);
                });
            });
        },

        // =========================================================================
        // CALLOUT CARD METHODS
        // =========================================================================

        /**
         * Open modal to add a new callout card.
         *
         * @param {number|string} initialTimecode
         */
        openCalloutModalForAdd: function(initialTimecode) {
            const modalEl = this.calloutModalEl || document.getElementById('smartVideoCalloutModal');
            if (!modalEl) {
                return;
            }

            const idField = document.getElementById('calloutId');
            if (idField) idField.value = '0';
            const tcField = document.getElementById('calloutTimecode');
            if (tcField) tcField.value = formatTime(parseTime(initialTimecode));
            const durField = document.getElementById('calloutDuration');
            if (durField) durField.value = '8';
            const titleField = document.getElementById('calloutTitle');
            if (titleField) titleField.value = '';
            const bodyField = document.getElementById('calloutBody');
            if (bodyField) bodyField.value = '';
            const posField = document.getElementById('calloutPosition');
            if (posField) posField.value = 'bottom-right';
            const autoField = document.getElementById('calloutAutopause');
            if (autoField) autoField.checked = false;
            const labelField = document.getElementById('calloutLinkLabel');
            if (labelField) labelField.value = '';
            const urlField = document.getElementById('calloutLinkUrl');
            if (urlField) urlField.value = '';

            const titleText = modalEl.querySelector('.callout-modal-title-text');
            if (titleText) {
                titleText.textContent = 'Add Callout Card';
            }
            showModal(modalEl);
        },

        /**
         * Open modal to edit an existing callout card.
         *
         * @param {HTMLElement} row
         */
        openCalloutModalForEdit: function(row) {
            const modalEl = this.calloutModalEl || document.getElementById('smartVideoCalloutModal');
            if (!modalEl || !row) {
                return;
            }

            const idField = document.getElementById('calloutId');
            if (idField) idField.value = row.dataset.calloutid || '0';
            const tcField = document.getElementById('calloutTimecode');
            if (tcField) tcField.value = formatTime(parseInt(row.dataset.timecode, 10) || 0);
            const durField = document.getElementById('calloutDuration');
            if (durField) durField.value = row.dataset.duration || '8';
            const titleField = document.getElementById('calloutTitle');
            if (titleField) titleField.value = row.dataset.title || '';
            const bodyField = document.getElementById('calloutBody');
            if (bodyField) bodyField.value = row.dataset.body || '';
            const posField = document.getElementById('calloutPosition');
            if (posField) posField.value = row.dataset.position || 'bottom-right';
            const autoField = document.getElementById('calloutAutopause');
            if (autoField) autoField.checked = (row.dataset.autopause === '1');
            const labelField = document.getElementById('calloutLinkLabel');
            if (labelField) labelField.value = row.dataset.linklabel || '';
            const urlField = document.getElementById('calloutLinkUrl');
            if (urlField) urlField.value = row.dataset.linkurl || '';

            const titleText = modalEl.querySelector('.callout-modal-title-text');
            if (titleText) {
                titleText.textContent = 'Edit Callout Card';
            }
            showModal(modalEl);
        },

        /**
         * Save callout card via web service.
         */
        saveCallout: function() {
            const self = this;
            const idField = document.getElementById('calloutId');
            const tcField = document.getElementById('calloutTimecode');
            const durField = document.getElementById('calloutDuration');
            const titleField = document.getElementById('calloutTitle');
            const bodyField = document.getElementById('calloutBody');
            const posField = document.getElementById('calloutPosition');
            const autoField = document.getElementById('calloutAutopause');
            const labelField = document.getElementById('calloutLinkLabel');
            const urlField = document.getElementById('calloutLinkUrl');

            const calloutId = idField ? (parseInt(idField.value, 10) || 0) : 0;
            const timecode = tcField ? parseTime(tcField.value) : 0;
            const duration = durField ? (parseInt(durField.value, 10) || 8) : 8;
            const title = titleField ? (titleField.value || '').trim() : '';
            const body = bodyField ? (bodyField.value || '').trim() : '';
            const position = posField ? (posField.value || 'bottom-right') : 'bottom-right';
            const autopause = autoField && autoField.checked ? 1 : 0;
            const linklabel = labelField ? (labelField.value || '').trim() : '';
            let linkurl = urlField ? (urlField.value || '').trim() : '';
            if (linkurl && !/^(https?:\/\/|\/\/|\/|#)/i.test(linkurl)) {
                linkurl = 'https://' + linkurl;
            }

            if (!title) {
                Notification.alert('Validation Error', 'Callout title cannot be empty.', 'OK');
                return;
            }

            if (self.duration > 0 && timecode > self.duration) {
                Notification.alert(
                    'Invalid Timestamp',
                    'Callout timestamp cannot exceed video duration (' + formatTime(self.duration) + ').',
                    'OK'
                );
                return;
            }

            const modalEl = self.calloutModalEl || document.getElementById('smartVideoCalloutModal');
            const saveBtn = modalEl ? modalEl.querySelector('.btn-save-callout') : null;
            if (saveBtn) {
                saveBtn.disabled = true;
            }

            Ajax.call([{
                methodname: 'mod_smartvideo_save_callout',
                args: {
                    cmid: self.cmid,
                    calloutid: calloutId,
                    timecode: timecode,
                    duration: duration,
                    title: title,
                    body: body,
                    linkurl: linkurl,
                    linklabel: linklabel,
                    autopause: autopause,
                    position: position
                }
            }])[0].then(function(res) {
                if (self.isSuccessResponse(res)) {
                    hideModal(modalEl);
                    self.setActiveTab('#tab-callouts');
                    window.location.reload();
                } else {
                    if (saveBtn) saveBtn.disabled = false;
                }
            }).catch(function(err) {
                if (saveBtn) saveBtn.disabled = false;
                Notification.exception(err);
            });
        },

        /**
         * Delete callout card with confirmation.
         *
         * @param {number} calloutId
         * @param {HTMLElement} row
         */
        deleteCallout: function(calloutId, row) {
            const self = this;
            Str.get_string('deletecalloutconfirm', 'mod_smartvideo').then(function(msg) {
                Notification.confirm('Delete Callout Card', msg, 'Delete', 'Cancel', function() {
                    Ajax.call([{
                        methodname: 'mod_smartvideo_delete_callout',
                        args: {
                            cmid: self.cmid,
                            calloutid: calloutId
                        }
                    }])[0].then(function(res) {
                        if (self.isSuccessResponse(res)) {
                            row.remove();
                            self.setActiveTab('#tab-callouts');
                            window.location.reload();
                        }
                    }).catch(Notification.exception);
                });
            });
        },

        // =========================================================================
        // SUBTITLE TRACK METHODS
        // =========================================================================

        /**
         * Open modal to add a new subtitle track.
         */
        openSubtitlesModalForAdd: function() {
            const modalEl = this.subtitlesModalEl || document.getElementById('smartVideoSubtitlesModal');
            if (!modalEl) {
                return;
            }

            const trackIdField = document.getElementById('subTrackId');
            if (trackIdField) trackIdField.value = '0';
            const langField = document.getElementById('subLang');
            if (langField) langField.value = 'en';
            const labelField = document.getElementById('subLabel');
            if (labelField) labelField.value = 'English';
            const vttField = document.getElementById('subVttContent');
            if (vttField) vttField.value = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWelcome to this session.\n";

            const titleText = modalEl.querySelector('.subtitles-modal-title-text');
            if (titleText) {
                titleText.textContent = 'Add Subtitles Track';
            }
            showModal(modalEl);
        },

        /**
         * Open modal to edit an existing subtitle track.
         *
         * @param {HTMLElement} row
         */
        openSubtitlesModalForEdit: function(row) {
            const modalEl = this.subtitlesModalEl || document.getElementById('smartVideoSubtitlesModal');
            if (!modalEl || !row) {
                return;
            }

            const trackIdField = document.getElementById('subTrackId');
            if (trackIdField) trackIdField.value = row.dataset.trackid || '0';
            const langField = document.getElementById('subLang');
            if (langField) langField.value = row.dataset.lang || 'en';
            const labelField = document.getElementById('subLabel');
            if (labelField) labelField.value = row.dataset.label || '';
            const vttField = document.getElementById('subVttContent');
            if (vttField) vttField.value = row.dataset.content || '';

            const titleText = modalEl.querySelector('.subtitles-modal-title-text');
            if (titleText) {
                titleText.textContent = 'Edit Subtitles Track';
            }
            showModal(modalEl);
        },

        /**
         * Save subtitle track via web service.
         */
        saveSubtitles: function() {
            const self = this;
            const trackId = parseInt(document.getElementById('subTrackId').value, 10) || 0;
            const lang = (document.getElementById('subLang').value || 'en').trim();
            const label = (document.getElementById('subLabel').value || '').trim();
            const content = (document.getElementById('subVttContent').value || '').trim();

            if (!label) {
                Notification.alert('Validation Error', 'Display label cannot be empty.', 'OK');
                return;
            }

            if (!content || !content.toUpperCase().startsWith('WEBVTT')) {
                Notification.alert('Validation Error', 'Subtitles must begin with standard "WEBVTT" header.', 'OK');
                return;
            }

            const modalEl = self.subtitlesModalEl || document.getElementById('smartVideoSubtitlesModal');
            const saveBtn = modalEl ? modalEl.querySelector('.btn-save-subtitles') : null;
            if (saveBtn) {
                saveBtn.disabled = true;
            }

            Ajax.call([{
                methodname: 'mod_smartvideo_save_subtitles',
                args: {
                    cmid: self.cmid,
                    trackid: trackId,
                    lang: lang,
                    label: label,
                    content: content
                }
            }])[0].then(function(res) {
                if (self.isSuccessResponse(res)) {
                    hideModal(modalEl);
                    self.setActiveTab('#tab-subtitles');
                    window.location.reload();
                } else {
                    if (saveBtn) saveBtn.disabled = false;
                }
            }).catch(function(err) {
                if (saveBtn) saveBtn.disabled = false;
                Notification.exception(err);
            });
        },

        /**
         * Delete subtitle track with confirmation.
         *
         * @param {number} trackId
         * @param {HTMLElement} row
         */
        deleteSubtitles: function(trackId, row) {
            const self = this;
            Notification.confirm('Delete Subtitles', 'Are you sure you want to delete this subtitle track?', 'Delete', 'Cancel', function() {
                Ajax.call([{
                    methodname: 'mod_smartvideo_delete_subtitles',
                    args: {
                        cmid: self.cmid,
                        trackid: trackId
                    }
                }])[0].then(function(res) {
                    if (self.isSuccessResponse(res)) {
                        row.remove();
                        self.setActiveTab('#tab-subtitles');
                        window.location.reload();
                    }
                }).catch(Notification.exception);
            });
        }
    };

    return {
        /**
         * Initialize module.
         *
         * @param {Object} config
         */
        init: function(config) {
            new QuestionsManager(config);
        }
    };
});
