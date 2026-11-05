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
     * Show Bootstrap 5 modal safely.
     *
     * @param {HTMLElement} el
     */
    function showModal(el) {
        if (!el) {
            return;
        }
        if (window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
        } else {
            el.classList.add('show');
            el.style.display = 'block';
        }
    }

    /**
     * Hide Bootstrap 5 modal safely.
     *
     * @param {HTMLElement} el
     */
    function hideModal(el) {
        if (!el) {
            return;
        }
        if (window.bootstrap && window.bootstrap.Modal) {
            const modal = window.bootstrap.Modal.getInstance(el);
            if (modal) {
                modal.hide();
            }
        } else {
            el.classList.remove('show');
            el.style.display = 'none';
        }
    }

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
            this.setupPreviewPlayer();
            this.setupEventListeners();
            this.setupQuickQuestionUI();
            this.loadCategories();
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
            require(['local_securevideolibrary/hls'], function(Hls) {
                const HlsClass = Hls || window.Hls;
                const containerData = document.getElementById('smartVideoContainer') ||
                                      document.getElementById('secureVideoContainer') ||
                                      self.container;
                const playlistUrl = containerData.dataset.playlisturl;

                if (playlistUrl && HlsClass && HlsClass.isSupported()) {
                    const hls = new HlsClass({debug: false});
                    hls.loadSource(playlistUrl);
                    hls.attachMedia(video);
                }
            }, function() {
                // Native playback fallback.
            });

            video.addEventListener('timeupdate', function() {
                const formatted = formatTime(video.currentTime);
                if (scrubInput) {
                    scrubInput.value = formatted;
                }
                if (timerBadge) {
                    timerBadge.textContent = formatted + ' / ' + formatTime(self.duration);
                }
            });
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
            const video = document.getElementById('smartVideoPreviewElement');

            // --- Jump to time button in all tables ---
            this.container.querySelectorAll('.btn-jump-to-time').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const timecode = parseInt(btn.dataset.timecode, 10) || 0;
                    if (video) {
                        video.currentTime = timecode;
                        video.scrollIntoView({behavior: 'smooth', block: 'center'});
                    }
                });
            });

            // --- Question Event Listeners ---
            this.container.querySelectorAll('.btn-add-question').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openQuestionModalForAdd(btn.dataset.timecode || 0);
                });
            });

            const addQuestionAtCurrentBtn = this.container.querySelector('.btn-add-at-current');
            if (addQuestionAtCurrentBtn) {
                addQuestionAtCurrentBtn.addEventListener('click', function() {
                    const currentTime = video ? Math.floor(video.currentTime) : 0;
                    self.openQuestionModalForAdd(currentTime);
                });
            }

            this.container.querySelectorAll('.btn-edit-cue').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openQuestionModalForEdit(row);
                });
            });

            this.container.querySelectorAll('.btn-delete-cue').forEach(function(btn) {
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

            if (this.questionModalEl) {
                const saveQuestionBtn = this.questionModalEl.querySelector('.btn-save-cue');
                if (saveQuestionBtn) {
                    saveQuestionBtn.addEventListener('click', function() {
                        self.saveQuestion();
                    });
                }
            }

            // --- Chapter Event Listeners ---
            this.container.querySelectorAll('.btn-add-chapter').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openChapterModalForAdd(btn.dataset.timecode || 0);
                });
            });

            const addChapterAtCurrentBtn = this.container.querySelector('.btn-add-chapter-at-current');
            if (addChapterAtCurrentBtn) {
                addChapterAtCurrentBtn.addEventListener('click', function() {
                    const currentTime = video ? Math.floor(video.currentTime) : 0;
                    self.openChapterModalForAdd(currentTime);
                });
            }

            this.container.querySelectorAll('.btn-edit-chapter').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openChapterModalForEdit(row);
                });
            });

            this.container.querySelectorAll('.btn-delete-chapter').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const chapterId = parseInt(row.dataset.chapterid, 10);
                    self.deleteChapter(chapterId, row);
                });
            });

            if (this.chapterModalEl) {
                const saveChapterBtn = this.chapterModalEl.querySelector('.btn-save-chapter');
                if (saveChapterBtn) {
                    saveChapterBtn.addEventListener('click', function() {
                        self.saveChapter();
                    });
                }
            }

            // --- Callout Event Listeners ---
            this.container.querySelectorAll('.btn-add-callout').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openCalloutModalForAdd(btn.dataset.timecode || 0);
                });
            });

            const addCalloutAtCurrentBtn = this.container.querySelector('.btn-add-callout-at-current');
            if (addCalloutAtCurrentBtn) {
                addCalloutAtCurrentBtn.addEventListener('click', function() {
                    const currentTime = video ? Math.floor(video.currentTime) : 0;
                    self.openCalloutModalForAdd(currentTime);
                });
            }

            this.container.querySelectorAll('.btn-edit-callout').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openCalloutModalForEdit(row);
                });
            });

            this.container.querySelectorAll('.btn-delete-callout').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const calloutId = parseInt(row.dataset.calloutid, 10);
                    self.deleteCallout(calloutId, row);
                });
            });

            if (this.calloutModalEl) {
                const saveCalloutBtn = this.calloutModalEl.querySelector('.btn-save-callout');
                if (saveCalloutBtn) {
                    saveCalloutBtn.addEventListener('click', function() {
                        self.saveCallout();
                    });
                }
            }

            // --- Subtitles Event Listeners ---
            this.container.querySelectorAll('.btn-add-subtitles').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    self.openSubtitlesModalForAdd();
                });
            });

            this.container.querySelectorAll('.btn-edit-subtitles').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openSubtitlesModalForEdit(row);
                });
            });

            this.container.querySelectorAll('.btn-delete-subtitles').forEach(function(btn) {
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

            if (this.subtitlesModalEl) {
                const saveSubtitlesBtn = this.subtitlesModalEl.querySelector('.btn-save-subtitles');
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
                    quickCatSelect.innerHTML = '<option value="0">Default Course Category</option>';
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
            document.getElementById('cueId').value = '0';
            document.getElementById('cueQid').value = '0';
            document.getElementById('cueQbeId').value = '0';
            document.getElementById('cueTimecode').value = formatTime(parseTime(initialTimecode));
            document.getElementById('cueTitle').value = '';
            document.getElementById('cueCategorySelect').value = '';

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

            document.getElementById('cueRequireCorrect').checked = true;
            document.getElementById('cueRewindTo').value = '';
            const styleSelect = document.getElementById('cueQuestionStyle');
            if (styleSelect) {
                styleSelect.value = 'compact';
            }

            // Default to Question Bank tab
            const bankTabBtn = document.getElementById('source-bank-tab');
            if (bankTabBtn && window.bootstrap && window.bootstrap.Tab) {
                const tab = window.bootstrap.Tab.getOrCreateInstance(bankTabBtn);
                tab.show();
            }

            this.questionModalEl.querySelector('.modal-title-text').textContent = 'Add Interactive Question';
            showModal(this.questionModalEl);
        },

        /**
         * Open modal to edit an existing question cuepoint.
         *
         * @param {HTMLElement} row
         */
        openQuestionModalForEdit: function(row) {
            const cueId = row.dataset.cueid;
            const timecode = parseInt(row.dataset.timecode, 10);
            const qid = parseInt(row.dataset.qid, 10);
            const qbeId = parseInt(row.dataset.qbeid, 10);
            const title = row.dataset.title || '';
            const req = row.dataset.req === '1';
            const rewindTo = (row.dataset.rewindto !== undefined && row.dataset.rewindto !== '') ?
                parseInt(row.dataset.rewindto, 10) : -1;

            document.getElementById('cueId').value = cueId;
            document.getElementById('cueQid').value = qid;
            document.getElementById('cueQbeId').value = qbeId;
            document.getElementById('cueTimecode').value = formatTime(timecode);
            document.getElementById('cueTitle').value = title;
            document.getElementById('cueRequireCorrect').checked = req;
            document.getElementById('cueRewindTo').value = (rewindTo >= 0) ? formatTime(rewindTo) : '';
            const styleSelect = document.getElementById('cueQuestionStyle');
            if (styleSelect) {
                styleSelect.value = row.dataset.style || 'compact';
            }

            // When editing an existing cuepoint, activate Question Bank tab
            const bankTabBtn = document.getElementById('source-bank-tab');
            if (bankTabBtn && window.bootstrap && window.bootstrap.Tab) {
                const tab = window.bootstrap.Tab.getOrCreateInstance(bankTabBtn);
                tab.show();
            }

            this.questionModalEl.querySelector('.modal-title-text').textContent = 'Edit Interactive Question';
            showModal(this.questionModalEl);
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
                    if (res.status) {
                        window.location.reload();
                    }
                }).catch(Notification.exception);

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
                    if (res.status) {
                        window.location.reload();
                    }
                }).catch(Notification.exception);
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
                        if (res.status) {
                            row.remove();
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
            document.getElementById('chapterId').value = '0';
            document.getElementById('chapterTimecode').value = formatTime(parseTime(initialTimecode));
            document.getElementById('chapterTitle').value = '';

            this.chapterModalEl.querySelector('.chapter-modal-title-text').textContent = 'Add Chapter';
            showModal(this.chapterModalEl);
        },

        /**
         * Open modal to edit an existing chapter.
         *
         * @param {HTMLElement} row
         */
        openChapterModalForEdit: function(row) {
            const chapterId = row.dataset.chapterid;
            const timecode = parseInt(row.dataset.timecode, 10);
            const title = row.dataset.title || '';

            document.getElementById('chapterId').value = chapterId;
            document.getElementById('chapterTimecode').value = formatTime(timecode);
            document.getElementById('chapterTitle').value = title;

            this.chapterModalEl.querySelector('.chapter-modal-title-text').textContent = 'Edit Chapter';
            showModal(this.chapterModalEl);
        },

        /**
         * Save chapter via web service.
         */
        saveChapter: function() {
            const self = this;
            const chapterId = parseInt(document.getElementById('chapterId').value, 10) || 0;
            const timecode = parseTime(document.getElementById('chapterTimecode').value);
            const title = (document.getElementById('chapterTitle').value || '').trim();

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

            Ajax.call([{
                methodname: 'mod_smartvideo_save_chapter',
                args: {
                    cmid: self.cmid,
                    chapterid: chapterId,
                    timecode: timecode,
                    title: title
                }
            }])[0].then(function(res) {
                if (res.status) {
                    window.location.reload();
                }
            }).catch(Notification.exception);
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
                        if (res.status) {
                            row.remove();
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
            document.getElementById('calloutId').value = '0';
            document.getElementById('calloutTimecode').value = formatTime(parseTime(initialTimecode));
            document.getElementById('calloutDuration').value = '8';
            document.getElementById('calloutTitle').value = '';
            document.getElementById('calloutBody').value = '';
            document.getElementById('calloutPosition').value = 'bottom-right';
            document.getElementById('calloutAutopause').checked = false;
            document.getElementById('calloutLinkLabel').value = '';
            document.getElementById('calloutLinkUrl').value = '';

            this.calloutModalEl.querySelector('.callout-modal-title-text').textContent = 'Add Callout Card';
            showModal(this.calloutModalEl);
        },

        /**
         * Open modal to edit an existing callout card.
         *
         * @param {HTMLElement} row
         */
        openCalloutModalForEdit: function(row) {
            document.getElementById('calloutId').value = row.dataset.calloutid;
            document.getElementById('calloutTimecode').value = formatTime(parseInt(row.dataset.timecode, 10));
            document.getElementById('calloutDuration').value = row.dataset.duration || '8';
            document.getElementById('calloutTitle').value = row.dataset.title || '';
            document.getElementById('calloutBody').value = row.dataset.body || '';
            document.getElementById('calloutPosition').value = row.dataset.position || 'bottom-right';
            document.getElementById('calloutAutopause').checked = (row.dataset.autopause === '1');
            document.getElementById('calloutLinkLabel').value = row.dataset.linklabel || '';
            document.getElementById('calloutLinkUrl').value = row.dataset.linkurl || '';

            this.calloutModalEl.querySelector('.callout-modal-title-text').textContent = 'Edit Callout Card';
            showModal(this.calloutModalEl);
        },

        /**
         * Save callout card via web service.
         */
        saveCallout: function() {
            const self = this;
            const calloutId = parseInt(document.getElementById('calloutId').value, 10) || 0;
            const timecode = parseTime(document.getElementById('calloutTimecode').value);
            const duration = parseInt(document.getElementById('calloutDuration').value, 10) || 8;
            const title = (document.getElementById('calloutTitle').value || '').trim();
            const body = (document.getElementById('calloutBody').value || '').trim();
            const position = document.getElementById('calloutPosition').value || 'bottom-right';
            const autopause = document.getElementById('calloutAutopause').checked ? 1 : 0;
            const linklabel = (document.getElementById('calloutLinkLabel').value || '').trim();
            const linkurl = (document.getElementById('calloutLinkUrl').value || '').trim();

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
                if (res.status) {
                    window.location.reload();
                }
            }).catch(Notification.exception);
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
                        if (res.status) {
                            row.remove();
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
            document.getElementById('subTrackId').value = '0';
            document.getElementById('subLang').value = 'en';
            document.getElementById('subLabel').value = 'English';
            document.getElementById('subVttContent').value = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWelcome to this session.\n";

            this.subtitlesModalEl.querySelector('.subtitles-modal-title-text').textContent = 'Add Subtitles Track';
            showModal(this.subtitlesModalEl);
        },

        /**
         * Open modal to edit an existing subtitle track.
         *
         * @param {HTMLElement} row
         */
        openSubtitlesModalForEdit: function(row) {
            document.getElementById('subTrackId').value = row.dataset.trackid || '0';
            document.getElementById('subLang').value = row.dataset.lang || 'en';
            document.getElementById('subLabel').value = row.dataset.label || '';
            document.getElementById('subVttContent').value = row.dataset.content || '';

            this.subtitlesModalEl.querySelector('.subtitles-modal-title-text').textContent = 'Edit Subtitles Track';
            showModal(this.subtitlesModalEl);
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
                if (res.status) {
                    window.location.reload();
                }
            }).catch(Notification.exception);
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
                    if (res.status) {
                        row.remove();
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
