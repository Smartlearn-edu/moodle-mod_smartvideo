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
 * Controller for interactive questions authoring and timeline cue management.
 *
 * @module     mod_securevideo/questions
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
     * Interactive questions authoring manager.
     *
     * @param {Object} config Configuration object with cmid and duration.
     */
    function QuestionsManager(config) {
        this.cmid = config.cmid;
        this.duration = config.duration || 0;
        this.container = document.querySelector('.mod-securevideo-questions-container');
        this.modalEl = document.getElementById('secureVideoAddQuestionModal');
        this.categories = [];
        this.currentQuestions = [];

        this.init();
    }

    QuestionsManager.prototype = {
        /**
         * Initialize events and preview player.
         */
        init: function() {
            this.setupPreviewPlayer();
            this.setupEventListeners();
            this.loadCategories();
        },

        /**
         * Setup mini video preview player and timeline scrubber.
         */
        setupPreviewPlayer: function() {
            const self = this;
            const video = document.getElementById('secureVideoPreviewElement');
            const scrubInput = document.getElementById('secureVideoScrubTimeInput');
            const timerBadge = this.container.querySelector('.securevideo-preview-timer');

            if (!video) {
                return;
            }

            // HLS stream loader if available.
            require(['local_securevideolibrary/hls'], function(Hls) {
                const HlsClass = Hls || window.Hls;
                const containerData = document.getElementById('secureVideoContainer') || self.container;
                const playlistUrl = containerData.dataset.playlisturl;

                if (playlistUrl && HlsClass && HlsClass.isSupported()) {
                    const hls = new HlsClass({debug: false});
                    hls.loadSource(playlistUrl);
                    hls.attachMedia(video);
                }
            }, function() {
                // If local HLS module not found, browser will attempt native playback.
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
         * Setup button clicks and modal events.
         */
        setupEventListeners: function() {
            const self = this;
            const video = document.getElementById('secureVideoPreviewElement');

            // Add question button (from header or empty state).
            this.container.querySelectorAll('.btn-add-question').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    self.openModalForAdd(btn.dataset.timecode || 0);
                });
            });

            // Add question at current preview scrub position.
            const addAtCurrentBtn = this.container.querySelector('.btn-add-at-current');
            if (addAtCurrentBtn) {
                addAtCurrentBtn.addEventListener('click', function() {
                    const currentTime = video ? Math.floor(video.currentTime) : 0;
                    self.openModalForAdd(currentTime);
                });
            }

            // Jump to time button in table rows.
            this.container.querySelectorAll('.btn-jump-to-time').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const timecode = parseInt(btn.dataset.timecode, 10) || 0;
                    if (video) {
                        video.currentTime = timecode;
                        video.scrollIntoView({behavior: 'smooth', block: 'center'});
                    }
                });
            });

            // Edit cuepoint button.
            this.container.querySelectorAll('.btn-edit-cue').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    self.openModalForEdit(row);
                });
            });

            // Delete cuepoint button.
            this.container.querySelectorAll('.btn-delete-cue').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    const row = btn.closest('tr');
                    const cueId = parseInt(row.dataset.cueid, 10);
                    self.deleteCuepoint(cueId, row);
                });
            });

            // Category select change in modal.
            const catSelect = document.getElementById('cueCategorySelect');
            if (catSelect) {
                catSelect.addEventListener('change', function() {
                    self.onCategoryChange(parseInt(catSelect.value, 10));
                });
            }

            // Question select change in modal.
            const qSelect = document.getElementById('cueQuestionSelect');
            if (qSelect) {
                qSelect.addEventListener('change', function() {
                    self.onQuestionChange(parseInt(qSelect.value, 10));
                });
            }

            // Save cuepoint button in modal.
            const saveBtn = this.modalEl.querySelector('.btn-save-cue');
            if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                    self.saveCuepoint();
                });
            }
        },

        /**
         * Load course question categories via web service.
         */
        loadCategories: function() {
            const self = this;
            const catSelect = document.getElementById('cueCategorySelect');

            Ajax.call([{
                methodname: 'mod_securevideo_get_course_categories',
                args: {cmid: self.cmid}
            }])[0].then(function(categories) {
                self.categories = categories || [];
                if (!catSelect) {
                    return;
                }

                catSelect.innerHTML = '<option value="">Choose a category...</option>';
                self.categories.forEach(function(cat) {
                    const opt = document.createElement('option');
                    opt.value = cat.id;
                    opt.textContent = cat.displayname;
                    catSelect.appendChild(opt);
                });
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
                qSelect.innerHTML = '<option value="">Choose a question...</option>';
                qSelect.disabled = true;
                if (previewBox) {
                    previewBox.classList.add('d-none');
                }
                return;
            }

            qSelect.disabled = true;
            qSelect.innerHTML = '<option value="">Loading questions...</option>';

            Ajax.call([{
                methodname: 'mod_securevideo_get_category_questions',
                args: {cmid: self.cmid, categoryid: categoryId}
            }])[0].then(function(questions) {
                self.currentQuestions = questions || [];
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
         * When a question is selected in the modal, show its preview.
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
        openModalForAdd: function(initialTimecode) {
            document.getElementById('cueId').value = '0';
            document.getElementById('cueQid').value = '0';
            document.getElementById('cueQbeId').value = '0';
            document.getElementById('cueTimecode').value = formatTime(parseTime(initialTimecode));
            document.getElementById('cueTitle').value = '';
            document.getElementById('cueCategorySelect').value = '';

            const qSelect = document.getElementById('cueQuestionSelect');
            qSelect.innerHTML = '<option value="">Choose a question...</option>';
            qSelect.disabled = true;

            const previewBox = document.getElementById('cueQuestionPreviewBox');
            if (previewBox) {
                previewBox.classList.add('d-none');
            }

            document.getElementById('cueRequireCorrect').checked = true;
            document.getElementById('cueRewindTo').value = '';
            const styleSelect = document.getElementById('cueQuestionStyle');
            if (styleSelect) {
                styleSelect.value = 'compact';
            }

            this.modalEl.querySelector('.modal-title-text').textContent = 'Add Question';

            const bsModal = window.bootstrap ? new window.bootstrap.Modal(this.modalEl) : null;
            if (bsModal) {
                bsModal.show();
            } else {
                this.modalEl.classList.add('show');
                this.modalEl.style.display = 'block';
            }
        },

        /**
         * Open modal to edit an existing cuepoint.
         *
         * @param {HTMLElement} row Table row element.
         */
        openModalForEdit: function(row) {
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

            this.modalEl.querySelector('.modal-title-text').textContent = 'Edit Question';

            const bsModal = window.bootstrap ? new window.bootstrap.Modal(this.modalEl) : null;
            if (bsModal) {
                bsModal.show();
            } else {
                this.modalEl.classList.add('show');
                this.modalEl.style.display = 'block';
            }
        },

        /**
         * Save cuepoint via web service.
         */
        saveCuepoint: function() {
            const self = this;
            const cueId = parseInt(document.getElementById('cueId').value, 10) || 0;
            let qbeId = parseInt(document.getElementById('cueQbeId').value, 10) || 0;
            const qSelect = document.getElementById('cueQuestionSelect');
            let qid = parseInt(qSelect.value, 10) || 0;
            if (qid <= 0) {
                qid = parseInt(document.getElementById('cueQid').value, 10) || 0;
            }
            if (qbeId <= 0 && qSelect.selectedOptions && qSelect.selectedOptions[0]) {
                qbeId = parseInt(qSelect.selectedOptions[0].dataset.qbeid, 10) || 0;
            }
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

            if (qid <= 0 && qbeId <= 0 && cueId <= 0) {
                Notification.alert('Error', 'Please select a question from the Question Bank.', 'OK');
                return;
            }

            if (self.duration > 0 && timecode > self.duration) {
                Notification.alert(
                    'Invalid Timestamp',
                    'Timestamp cannot exceed video duration (' + formatTime(self.duration) + ').',
                    'OK'
                );
                return;
            }

            Ajax.call([{
                methodname: 'mod_securevideo_save_cuepoint',
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
        },

        /**
         * Delete cuepoint with confirmation.
         *
         * @param {number} cueId
         * @param {HTMLElement} row
         */
        deleteCuepoint: function(cueId, row) {
            const self = this;
            Str.get_string('deletequestionconfirm', 'mod_securevideo').then(function(msg) {
                Notification.confirm('Delete Question', msg, 'Delete', 'Cancel', function() {
                    Ajax.call([{
                        methodname: 'mod_securevideo_delete_cuepoint',
                        args: {
                            cmid: self.cmid,
                            cueid: cueId
                        }
                    }])[0].then(function(res) {
                        if (res.status) {
                            row.remove();
                            const tbody = self.container.querySelector('tbody');
                            if (!tbody || tbody.children.length === 0) {
                                window.location.reload();
                            }
                        }
                    }).catch(Notification.exception);
                });
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
