<?php
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
 * Activity settings form for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/moodleform_mod.php');

/**
 * Module settings form.
 */
class mod_smartvideo_mod_form extends moodleform_mod {
    /**
     * Define the form elements.
     *
     * @return void
     */
    public function definition(): void {
        global $CFG, $DB, $OUTPUT, $PAGE;

        $mform = $this->_form;
        $course = $this->get_course();

        // -------------------------------------------------------------------------------
        // General section.
        $mform->addElement('header', 'general', get_string('general', 'form'));

        $mform->addElement('text', 'name', get_string('name'), ['size' => '64']);
        if (!empty($CFG->formatstringstriptags)) {
            $mform->setType('name', PARAM_TEXT);
        } else {
            $mform->setType('name', PARAM_CLEANHTML);
        }
        $mform->addRule('name', null, 'required', null, 'client');
        $mform->addRule('name', get_string('maximumchars', '', 255), 'maxlength', 255, 'client');

        $this->standard_intro_elements();

        // -------------------------------------------------------------------------------
        // Video Selection Section.
        $mform->addElement('header', 'videoselectionheader', get_string('videoselection', 'mod_smartvideo'));

        // Check enabled providers in admin config.
        $enabledconfig = get_config('mod_smartvideo', 'videosources');
        if ($enabledconfig === false || $enabledconfig === null) {
            $allowedsources = ['securelibrary', 'youtube', 'vimeo', 'html5video', 'bunnystream', 'vdocipher', 'dailymotion', 'wistia', 'screenpal'];
        } else {
            $allowedsources = explode(',', $enabledconfig);
        }

        $allowlibrary = in_array('securelibrary', $allowedsources);
        $allowexternal = (count(array_diff($allowedsources, ['securelibrary'])) > 0);

        // Current record state.
        $currentsource = $this->current->videosource ?? 'securelibrary';
        $currenturl    = $this->current->videourl ?? '';
        $currentdur    = $this->current->duration ?? 0;
        $currentposter = $this->current->posterimage ?? '';

        // Source type selector.
        if ($allowlibrary && $allowexternal) {
            $sourceradios = [];
            $sourceradios[] = $mform->createElement('radio', 'sourcetype', '', get_string('sourcetype_library', 'mod_smartvideo'), 'securelibrary');
            $sourceradios[] = $mform->createElement('radio', 'sourcetype', '', get_string('sourcetype_external', 'mod_smartvideo'), 'external');
            $mform->addGroup($sourceradios, 'sourcetypegroup', get_string('sourcetype', 'mod_smartvideo'), ['<br>'], false);
            $mform->setDefault('sourcetype', ($currentsource === 'securelibrary' ? 'securelibrary' : 'external'));
        } else if ($allowlibrary) {
            $mform->addElement('hidden', 'sourcetype', 'securelibrary');
            $mform->setType('sourcetype', PARAM_ALPHAEXT);
        } else {
            $mform->addElement('hidden', 'sourcetype', 'external');
            $mform->setType('sourcetype', PARAM_ALPHAEXT);
        }

        // --- SECURE LIBRARY SECTION ---
        // Hidden input storing selected media ID.
        $mform->addElement('hidden', 'mediaid', 0, ['id' => 'id_mediaid']);
        $mform->setType('mediaid', PARAM_INT);

        // Preview container rendering the selected video card or unselected placeholder.
        $currentmediaid = $this->current->mediaid ?? 0;
        if (empty($currentmediaid) && $this->_form->isSubmitted()) {
            $submitted = $this->_form->getSubmitValues();
            $currentmediaid = (int)($submitted['mediaid'] ?? 0);
        }
        $selectedmedia = null;
        if (!empty($currentmediaid)) {
            $selectedmedia = $DB->get_record('local_securevideolibrary_media', ['id' => $currentmediaid]);
        }

        $previewhtml = '<div id="smartvideo_selected_preview" class="mb-3">';
        if ($selectedmedia) {
            $mins = floor($selectedmedia->duration / 60);
            $secs = $selectedmedia->duration % 60;
            $durationformatted = sprintf('%02d:%02d', $mins, $secs);
            $thumburl = (new moodle_url('/local/securevideolibrary/serve.php', [
                'mediaid' => $selectedmedia->id,
                'file'    => 'thumbnail.jpg',
            ]))->out(false);

            $videolabel = get_string('selectedvideo', 'mod_smartvideo') . ' #' . $selectedmedia->id;
            $previewhtml .= '
            <div class="card border p-3 d-flex flex-row align-items-center gap-3 bg-light" style="max-width: 500px;">
                <div class="ratio ratio-16x9 bg-dark rounded overflow-hidden" style="width: 140px; flex-shrink: 0;">
                    <img src="' . s($thumburl) . '" alt="" class="w-100 h-100 object-fit-cover" style="object-fit: cover;">
                </div>
                <div class="flex-grow-1 overflow-hidden">
                    <strong class="d-block text-truncate mb-1">' . s($selectedmedia->title) . '</strong>
                    <span class="badge bg-secondary mb-1">' . s($durationformatted) . '</span>
                    <div class="text-muted small">' . $videolabel . '</div>
                </div>
            </div>';
        } else {
            $previewhtml .= '
            <div class="alert alert-warning d-flex align-items-center gap-2 mb-0" style="max-width: 500px;">
                <i class="fa fa-exclamation-circle fa-lg" aria-hidden="true"></i>
                <span>' . get_string('novideoselected', 'mod_smartvideo') . '</span>
            </div>';
        }
        $previewhtml .= '</div>';

        $mform->addElement('static', 'videopreview', get_string('selectedvideo', 'mod_smartvideo'), $previewhtml);

        // Button opening the modal picker.
        $selectbutton = '<button type="button" class="btn btn-primary" '
            . 'data-bs-toggle="modal" data-bs-target="#smartVideoPickerModal" '
            . 'data-toggle="modal" data-target="#smartVideoPickerModal">'
            . '<i class="fa fa-film me-1" aria-hidden="true"></i>'
            . get_string('selectfromlibrary', 'mod_smartvideo')
            . '</button>';
        $mform->addElement('static', 'selectvideobutton', '', $selectbutton);

        // --- EXTERNAL VIDEO URL SECTION ---
        $mform->addElement('hidden', 'videosource', $currentsource);
        $mform->setType('videosource', PARAM_ALPHAEXT);

        $mform->addElement('hidden', 'duration', $currentdur);
        $mform->setType('duration', PARAM_INT);

        $mform->addElement('hidden', 'posterimage', $currentposter);
        $mform->setType('posterimage', PARAM_RAW_TRIMMED);

        $mform->addElement('text', 'videourl', get_string('videourl', 'mod_smartvideo'), [
            'size' => '80',
            'id'   => 'id_videourl',
            'placeholder' => get_string('videourlplaceholder', 'mod_smartvideo'),
        ]);
        $mform->setType('videourl', PARAM_RAW_TRIMMED);
        $mform->addHelpButton('videourl', 'videourl', 'mod_smartvideo');

        // External preview and status container.
        $badgeshtml = '<div class="mb-2 d-flex flex-wrap gap-1 align-items-center">'
            . '<span class="badge bg-danger">YouTube</span>'
            . '<span class="badge bg-info text-dark">Vimeo</span>'
            . '<span class="badge bg-warning text-dark">Bunny Stream</span>'
            . '<span class="badge bg-primary">VdoCipher</span>'
            . '<span class="badge bg-dark">Dailymotion</span>'
            . '<span class="badge bg-success">Wistia</span>'
            . '<span class="badge bg-secondary">Direct MP4 / HLS</span>'
            . '</div>';

        $extpreviewhtml = '<div id="smartvideo_external_preview" class="mb-2">';
        if (!empty($currenturl) && $currentsource !== 'securelibrary') {
            $mins = floor($currentdur / 60);
            $secs = $currentdur % 60;
            $durationformatted = sprintf('%02d:%02d', $mins, $secs);
            $posterhtml = !empty($currentposter) ?
                '<img src="' . s($currentposter) . '" alt="" class="w-100 h-100 object-fit-cover" style="object-fit: cover;">' :
                '<div class="w-100 h-100 d-flex align-items-center justify-content-center bg-dark text-white"><i class="fa fa-play fa-2x"></i></div>';

            $extpreviewhtml .= '
            <div class="card border p-3 d-flex flex-row align-items-center gap-3 bg-light shadow-sm" style="max-width: 550px;">
                <div class="ratio ratio-16x9 bg-dark rounded overflow-hidden" style="width: 140px; flex-shrink: 0;">
                    ' . $posterhtml . '
                </div>
                <div class="flex-grow-1 overflow-hidden">
                    <div class="mb-1"><span class="badge bg-primary">' . s(strtoupper($currentsource)) . '</span></div>
                    <strong class="d-block text-truncate mb-1">' . s($this->current->name ?? 'External Video') . '</strong>
                    ' . ($currentdur > 0 ? '<span class="badge bg-secondary mb-1">' . s($durationformatted) . '</span>' : '') . '
                    <div class="text-muted small text-truncate">' . s($currenturl) . '</div>
                </div>
            </div>';
        }
        $extpreviewhtml .= '</div><div id="smartvideo_external_status"></div>' . $badgeshtml;

        $mform->addElement('static', 'externalpreview', '', $extpreviewhtml);

        // -------------------------------------------------------------------------------
        // Playback & Security Options.
        $mform->addElement('header', 'playbacksecurityheader', get_string('playbacksecurity', 'mod_smartvideo'));

        $mform->addElement('checkbox', 'watermarkenabled', get_string('watermarkenabled', 'mod_smartvideo'));
        $mform->addHelpButton('watermarkenabled', 'watermarkenabled', 'mod_smartvideo');
        $mform->setDefault('watermarkenabled', 1);

        $mform->addElement('text', 'watermarkopacity', get_string('watermarkopacity', 'mod_smartvideo'), ['size' => '5']);
        $mform->setType('watermarkopacity', PARAM_INT);
        $mform->addHelpButton('watermarkopacity', 'watermarkopacity', 'mod_smartvideo');
        $mform->setDefault('watermarkopacity', 35);
        $mform->hideIf('watermarkopacity', 'watermarkenabled', 'notchecked');

        $mform->addElement('checkbox', 'preventseeking', get_string('preventseeking', 'mod_smartvideo'));
        $mform->addHelpButton('preventseeking', 'preventseeking', 'mod_smartvideo');
        $mform->setDefault('preventseeking', 0);

        // -------------------------------------------------------------------------------
        // Handouts & Supplementary Resources Section.
        $mform->addElement('header', 'resourcesheader', get_string('resources', 'mod_smartvideo'));

        $filemanageroptions = [
            'subdirs'   => 0,
            'maxbytes'  => $course->maxbytes,
            'maxfiles'  => 10,
        ];
        $mform->addElement('filemanager', 'resources_filemanager', get_string('resources', 'mod_smartvideo'), null, $filemanageroptions);
        $mform->addHelpButton('resources_filemanager', 'resources', 'mod_smartvideo');

        // -------------------------------------------------------------------------------
        // Appearance & Course Display Section.
        $mform->addElement('header', 'appearanceheader', get_string('appearanceheader', 'mod_smartvideo'));

        $mform->addElement('checkbox', 'usecustomposterimage', get_string('usecustomposterimage', 'mod_smartvideo'));
        $mform->addHelpButton('usecustomposterimage', 'customposterimage', 'mod_smartvideo');
        $mform->setDefault('usecustomposterimage', 0);

        $posterfileoptions = [
            'subdirs'        => 0,
            'maxbytes'       => $course->maxbytes,
            'maxfiles'       => 1,
            'accepted_types' => ['image'],
        ];
        $mform->addElement('filemanager', 'customposter_filemanager', get_string('customposterimage', 'mod_smartvideo'), null, $posterfileoptions);
        $mform->hideIf('customposter_filemanager', 'usecustomposterimage', 'notchecked');

        $mform->addElement('checkbox', 'displayinline', get_string('displayinline', 'mod_smartvideo'));
        $mform->addHelpButton('displayinline', 'displayinline', 'mod_smartvideo');
        $mform->setDefault('displayinline', 1);

        $mform->addElement('checkbox', 'horizontallayout', get_string('horizontallayout', 'mod_smartvideo'));
        $mform->addHelpButton('horizontallayout', 'horizontallayout', 'mod_smartvideo');
        $mform->setDefault('horizontallayout', 1);
        $mform->hideIf('horizontallayout', 'displayinline', 'notchecked');

        $mform->addElement('checkbox', 'showprogressbar', get_string('showprogressbar', 'mod_smartvideo'));
        $mform->addHelpButton('showprogressbar', 'showprogressbar', 'mod_smartvideo');
        $mform->setDefault('showprogressbar', 1);
        $mform->hideIf('showprogressbar', 'displayinline', 'notchecked');

        $mform->addElement('checkbox', 'showcompletionrequirements', get_string('showcompletionrequirements', 'mod_smartvideo'));
        $mform->addHelpButton('showcompletionrequirements', 'showcompletionrequirements', 'mod_smartvideo');
        $mform->setDefault('showcompletionrequirements', 1);
        $mform->hideIf('showcompletionrequirements', 'displayinline', 'notchecked');

        $mform->addElement('checkbox', 'showposterimage', get_string('showposterimage', 'mod_smartvideo'));
        $mform->addHelpButton('showposterimage', 'showposterimage', 'mod_smartvideo');
        $mform->setDefault('showposterimage', 1);
        $mform->hideIf('showposterimage', 'displayinline', 'notchecked');

        $mform->addElement('checkbox', 'showname', get_string('showname', 'mod_smartvideo'));
        $mform->addHelpButton('showname', 'showname', 'mod_smartvideo');
        $mform->setDefault('showname', 1);
        $mform->hideIf('showname', 'displayinline', 'notchecked');

        $mform->addElement('checkbox', 'showcustomfields', get_string('showcustomfields', 'mod_smartvideo'));
        $mform->addHelpButton('showcustomfields', 'showcustomfields', 'mod_smartvideo');
        $mform->setDefault('showcustomfields', 1);
        $mform->hideIf('showcustomfields', 'displayinline', 'notchecked');

        // -------------------------------------------------------------------------------
        // Activity Completion rules & Standard course module elements.
        $this->standard_coursemodule_elements();
        $this->add_action_buttons();

        // Render the modal HTML and load AMD picker module.
        $uploadurl = (new moodle_url('/local/securevideolibrary/manage.php', [
            'courseid' => $course->id,
        ]))->out(false);

        $modaldata = [
            'courseid'  => (int)$course->id,
            'hascourse' => ($course->id > 1),
            'uploadurl' => $uploadurl,
        ];

        $PAGE->requires->js_call_amd('mod_smartvideo/picker', 'init', [[
            'courseid' => (int)$course->id,
        ]]);
        $PAGE->requires->js_call_amd('mod_smartvideo/form', 'init');

        $mform->addElement('html', $OUTPUT->render_from_template('mod_smartvideo/picker_modal', $modaldata));
    }

    /**
     * Add custom completion rules to the form.
     *
     * @return array Array of string IDs of added items.
     */
    public function add_completion_rules(): array {
        $mform = $this->_form;

        $group = [];
        $group[] = $mform->createElement(
            'checkbox',
            'completionminpercentenabled',
            '',
            get_string('completionminpercent', 'mod_smartvideo')
        );
        $group[] = $mform->createElement('text', 'completionminpercent', '', ['size' => '3']);
        $mform->setType('completionminpercent', PARAM_INT);
        $mform->setDefault('completionminpercent', 80);

        $mform->addGroup(
            $group,
            'completionminpercentgroup',
            get_string('completionminpercent', 'mod_smartvideo'),
            [' '],
            false
        );
        $mform->addHelpButton('completionminpercentgroup', 'completionminpercent', 'mod_smartvideo');
        $mform->disabledIf('completionminpercent', 'completionminpercentenabled', 'notchecked');

        $mform->addElement(
            'checkbox',
            'completionrequirequestions',
            get_string('completionrequirequestions', 'mod_smartvideo'),
            get_string('completionrequirequestions', 'mod_smartvideo')
        );
        $mform->addHelpButton('completionrequirequestions', 'completionrequirequestions', 'mod_smartvideo');

        return ['completionminpercentgroup', 'completionrequirequestions'];
    }

    /**
     * Determines if completion rules are satisfied.
     *
     * @param array $data Form data.
     * @return bool
     */
    public function completion_rule_enabled($data): bool {
        return (!empty($data['completionminpercentenabled']) && !empty($data['completionminpercent']))
            || !empty($data['completionrequirequestions']);
    }

    /**
     * Set default data on form load.
     *
     * @param array $defaultvalues
     * @return void
     */
    public function data_preprocessing(&$defaultvalues): void {
        parent::data_preprocessing($defaultvalues);

        if (!empty($defaultvalues['videosource']) && $defaultvalues['videosource'] !== 'securelibrary') {
            $defaultvalues['sourcetype'] = 'external';
        } else {
            $defaultvalues['sourcetype'] = 'securelibrary';
        }

        if (!empty($defaultvalues['completionminpercent'])) {
            $defaultvalues['completionminpercentenabled'] = 1;
        }

        if (!empty($defaultvalues['completionrequirequestions'])) {
            $defaultvalues['completionrequirequestions'] = 1;
        }

        $displayopts = !empty($defaultvalues['displayoptions']) ? json_decode($defaultvalues['displayoptions'], true) : [];
        $defaultvalues['usecustomposterimage'] = !empty($displayopts['usecustomposterimage']) ? 1 : 0;
        $defaultvalues['horizontallayout'] = isset($displayopts['horizontallayout']) ? (int)$displayopts['horizontallayout'] : 1;
        $defaultvalues['showprogressbar'] = isset($displayopts['showprogressbar']) ? (int)$displayopts['showprogressbar'] : 1;
        $defaultvalues['showcompletionrequirements'] = isset($displayopts['showcompletionrequirements']) ? (int)$displayopts['showcompletionrequirements'] : 1;
        $defaultvalues['showposterimage'] = isset($displayopts['showposterimage']) ? (int)$displayopts['showposterimage'] : 1;
        $defaultvalues['showname'] = isset($displayopts['showname']) ? (int)$displayopts['showname'] : 1;
        $defaultvalues['showcustomfields'] = isset($displayopts['showcustomfields']) ? (int)$displayopts['showcustomfields'] : 1;

        if (isset($defaultvalues['displayinline'])) {
            $defaultvalues['displayinline'] = (int)$defaultvalues['displayinline'];
        } else {
            $defaultvalues['displayinline'] = 1;
        }

        if ($this->current && !empty($this->current->coursemodule)) {
            $context = context_module::instance($this->current->coursemodule);
            $draftitemid = file_get_submitted_draft_itemid('resources_filemanager');
            file_prepare_draft_area(
                $draftitemid,
                $context->id,
                'mod_smartvideo',
                'resources',
                0,
                ['subdirs' => 0, 'maxfiles' => 10]
            );
            $defaultvalues['resources_filemanager'] = $draftitemid;

            $posterdraftitemid = file_get_submitted_draft_itemid('customposter_filemanager');
            file_prepare_draft_area(
                $posterdraftitemid,
                $context->id,
                'mod_smartvideo',
                'posterimage',
                0,
                ['subdirs' => 0, 'maxfiles' => 1]
            );
            $defaultvalues['customposter_filemanager'] = $posterdraftitemid;
        }
    }

    /**
     * Validation of form data.
     *
     * @param array $data
     * @param array $files
     * @return array
     */
    public function validation($data, $files): array {
        $errors = parent::validation($data, $files);

        $sourcetype = $data['sourcetype'] ?? 'securelibrary';
        if ($sourcetype === 'securelibrary') {
            if (empty($data['mediaid'])) {
                $errors['videopreview'] = get_string('err_novideoselected', 'mod_smartvideo');
            }
        } else {
            if (empty(trim($data['videourl'] ?? ''))) {
                $errors['videourl'] = get_string('invalidvideourl', 'mod_smartvideo');
            }
        }

        if (!empty($data['watermarkenabled'])) {
            $opacity = (int)($data['watermarkopacity'] ?? 0);
            if ($opacity < 10 || $opacity > 100) {
                $errors['watermarkopacity'] = get_string('numericrange', 'core_error', ['min' => 10, 'max' => 100]);
            }
        }

        if (!empty($data['completionminpercentenabled'])) {
            $percent = (int)($data['completionminpercent'] ?? 0);
            if ($percent < 1 || $percent > 100) {
                $errors['completionminpercentgroup'] = get_string(
                    'numericrange',
                    'core_error',
                    ['min' => 1, 'max' => 100]
                );
            }
        }

        return $errors;
    }
}
