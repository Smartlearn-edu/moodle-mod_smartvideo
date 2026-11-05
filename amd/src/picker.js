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
 * Interactive video library picker modal for mod_smartvideo.
 *
 * @module     mod_smartvideo/picker
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define(['core/ajax', 'core/notification', 'core/templates'], function(Ajax, Notification, Templates) {
    'use strict';

    let currentCourseId = 0;
    let currentScope = 'my';
    let currentSearch = '';
    let searchDebounceTimeout = null;

    function getModalElement() {
        return document.getElementById('smartVideoPickerModal') ||
               document.getElementById('secureVideoPickerModal');
    }

    /**
     * Fetch videos from local_securevideolibrary via web service.
     */
    function fetchVideos() {
        const modalEl = getModalElement();
        if (!modalEl) {
            return;
        }

        const gridEl = modalEl.querySelector('.smartvideo-picker-grid, .securevideo-picker-grid');
        const loadingEl = modalEl.querySelector('.smartvideo-picker-loading, .securevideo-picker-loading');
        const emptyEl = modalEl.querySelector('.smartvideo-picker-empty, .securevideo-picker-empty');
        const refreshBtn = modalEl.querySelector('.smartvideo-picker-refresh i, .securevideo-picker-refresh i');

        if (loadingEl) {
            loadingEl.classList.remove('d-none');
        }
        if (emptyEl) {
            emptyEl.classList.add('d-none');
        }
        if (gridEl) {
            gridEl.innerHTML = '';
        }
        if (refreshBtn) {
            refreshBtn.classList.add('fa-spin');
        }

        const request = {
            methodname: 'local_securevideolibrary_get_videos',
            args: {
                courseid: currentCourseId,
                scope: currentScope,
                search: currentSearch,
                page: 0,
                perpage: 60
            }
        };

        Ajax.call([request])[0].done(function(response) {
            if (loadingEl) {
                loadingEl.classList.add('d-none');
            }
            if (refreshBtn) {
                refreshBtn.classList.remove('fa-spin');
            }

            const readyVideos = (response.videos || []).filter(function(v) {
                return v.status === 'ready';
            });

            if (readyVideos.length === 0) {
                if (emptyEl) {
                    emptyEl.classList.remove('d-none');
                }
                return;
            }

            const renderPromises = readyVideos.map(function(video) {
                return Templates.render('mod_smartvideo/picker_card', video);
            });

            Promise.all(renderPromises).then(function(renderedHtmls) {
                if (gridEl) {
                    gridEl.innerHTML = renderedHtmls.join('');
                }
            }).catch(Notification.exception);
        }).fail(function(err) {
            if (loadingEl) {
                loadingEl.classList.add('d-none');
            }
            if (refreshBtn) {
                refreshBtn.classList.remove('fa-spin');
            }
            Notification.exception(err);
        });
    }

    /**
     * Update the preview container in mod_form.php when a video is selected.
     *
     * @param {Object} video Selected video data.
     */
    function applySelectedVideo(video) {
        let mediaIdInput = document.getElementById('id_mediaid');
        if (!mediaIdInput) {
            mediaIdInput = document.querySelector('input[name="mediaid"]');
        }
        if (!mediaIdInput) {
            const form = document.querySelector('form.mform');
            if (form) {
                mediaIdInput = form.querySelector('input[name="mediaid"]');
            }
        }

        const nameInput = document.getElementById('id_name') ||
                          document.querySelector('input[name="name"]');
        const previewEl = document.getElementById('smartvideo_selected_preview') ||
                          document.getElementById('securevideo_selected_preview');

        if (mediaIdInput) {
            mediaIdInput.value = String(video.id);
            try {
                mediaIdInput.dispatchEvent(new Event('change', { bubbles: true }));
                mediaIdInput.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) {
                // Ignore.
            }
        } else {
            console.error('[SmartVideo] mediaid input element not found in form.');
        }

        // Auto-fill activity name if empty.
        if (nameInput && !nameInput.value.trim()) {
            nameInput.value = video.title;
        }

        // Clear any validation error message displayed under videopreview.
        const errorElements = document.querySelectorAll(
            '#id_error_videopreview, [data-field="videopreview"] .invalid-feedback, ' +
            '#smartvideo_selected_preview + .text-danger, #smartvideo_selected_preview + .error, ' +
            '#securevideo_selected_preview + .text-danger, #securevideo_selected_preview + .error'
        );
        errorElements.forEach(function(el) {
            el.remove();
        });
        const parentFormGroup = previewEl ? previewEl.closest('.form-group, .fitem') : null;
        if (parentFormGroup) {
            parentFormGroup.classList.remove('has-danger', 'error');
            const errSpan = parentFormGroup.querySelector('.text-danger, .error, .invalid-feedback');
            if (errSpan) {
                errSpan.remove();
            }
        }

        if (previewEl) {
            const thumbHtml = video.thumbnail ?
                '<img src="' + video.thumbnail + '" alt="" class="w-100 h-100 object-fit-cover" style="object-fit: cover;">' :
                '<i class="fa fa-film fa-2x text-muted" aria-hidden="true"></i>';

            previewEl.innerHTML =
                '<div class="card border p-3 d-flex flex-row align-items-center gap-3 bg-light" style="max-width: 500px;">' +
                    '<div class="ratio ratio-16x9 bg-dark rounded overflow-hidden" style="width: 140px; flex-shrink: 0;">' +
                        thumbHtml +
                    '</div>' +
                    '<div class="flex-grow-1 overflow-hidden">' +
                        '<strong class="d-block text-truncate mb-1">' + video.title + '</strong>' +
                        '<span class="badge bg-secondary mb-1">' + video.duration + '</span>' +
                        '<div class="text-muted small">Selected Video #' + video.id + '</div>' +
                    '</div>' +
                '</div>';
        }

        // Close modal.
        const modalEl = getModalElement();
        if (modalEl) {
            if (window.bootstrap && window.bootstrap.Modal) {
                const bsModal = window.bootstrap.Modal.getInstance(modalEl) ||
                                window.bootstrap.Modal.getOrCreateInstance(modalEl);
                bsModal.hide();
            } else if (window.jQuery && typeof window.jQuery(modalEl).modal === 'function') {
                window.jQuery(modalEl).modal('hide');
            } else {
                modalEl.classList.remove('show');
                modalEl.style.display = 'none';
                document.body.classList.remove('modal-open');
            }
        }
    }

    /**
     * Setup event listeners.
     */
    function setupEvents() {
        const modalEl = getModalElement();
        if (!modalEl) {
            return;
        }

        // Fetch on first modal open.
        modalEl.addEventListener('show.bs.modal', function() {
            fetchVideos();
        });

        // Scope tabs.
        const tabButtons = modalEl.querySelectorAll('.smartvideo-picker-tabs button, .securevideo-picker-tabs button');
        tabButtons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                tabButtons.forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                currentScope = btn.dataset.scope || 'my';
                fetchVideos();
            });
        });

        // Search input with debounce.
        const searchInput = modalEl.querySelector('.smartvideo-picker-search, .securevideo-picker-search');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                clearTimeout(searchDebounceTimeout);
                searchDebounceTimeout = setTimeout(function() {
                    currentSearch = e.target.value.trim();
                    fetchVideos();
                }, 300);
            });
        }

        // Refresh button.
        const refreshBtn = modalEl.querySelector('.smartvideo-picker-refresh, .securevideo-picker-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                fetchVideos();
            });
        }

        // Select video button.
        modalEl.addEventListener('click', function(e) {
            const selectBtn = e.target.closest('.btn-select-video');
            if (!selectBtn) {
                return;
            }

            e.preventDefault();
            const videoData = {
                id: selectBtn.dataset.id,
                title: selectBtn.dataset.title,
                duration: selectBtn.dataset.duration,
                thumbnail: selectBtn.dataset.thumbnail
            };
            applySelectedVideo(videoData);
        });
    }

    return {
        /**
         * Initialize module.
         *
         * @param {Object} params Configuration parameters.
         */
        init: function(params) {
            currentCourseId = params.courseid || 0;
            setupEvents();
        }
    };
});
