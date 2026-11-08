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
 * Standard library callbacks and lifecycle hooks for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * List of features supported in mod_smartvideo.
 *
 * @param string $feature FEATURE_xx constant for requested feature
 * @return mixed True if module supports feature, false if not, null if doesn't know
 */
function smartvideo_supports(string $feature): ?bool {
    switch ($feature) {
        case FEATURE_MOD_INTRO:
            return true;
        case FEATURE_SHOW_DESCRIPTION:
            return true;
        case FEATURE_COMPLETION_TRACKS_VIEWS:
            return true;
        case FEATURE_COMPLETION_HAS_RULES:
            return true;
        case FEATURE_BACKUP_MOODLE2:
            return true;
        default:
            return null;
    }
}

/**
 * Add a new smartvideo instance.
 *
 * @param stdClass $data Post data from the form.
 * @param mod_smartvideo_mod_form|null $mform The form object.
 * @return int The ID of the newly created instance.
 */
function smartvideo_add_instance(stdClass $data, ?mod_smartvideo_mod_form $mform = null): int {
    global $DB;

    $data->timecreated = time();
    $data->timemodified = $data->timecreated;

    $data->watermarkenabled = !empty($data->watermarkenabled) ? 1 : 0;
    $data->watermarkopacity = isset($data->watermarkopacity) ? (int)$data->watermarkopacity : 35;
    $data->preventseeking   = !empty($data->preventseeking) ? 1 : 0;
    $data->completionminpercent = isset($data->completionminpercent) ? (int)$data->completionminpercent : 0;
    $data->completionrequirequestions = !empty($data->completionrequirequestions) ? 1 : 0;

    $data->displayinline = isset($data->displayinline) ? (int)$data->displayinline : 1;
    $displayoptions = [
        'usecustomposterimage'       => !empty($data->usecustomposterimage) ? 1 : 0,
        'horizontallayout'           => isset($data->horizontallayout) ? (int)$data->horizontallayout : 1,
        'showprogressbar'            => isset($data->showprogressbar) ? (int)$data->showprogressbar : 1,
        'showcompletionrequirements' => isset($data->showcompletionrequirements) ? (int)$data->showcompletionrequirements : 1,
        'showposterimage'            => isset($data->showposterimage) ? (int)$data->showposterimage : 1,
        'showname'                   => isset($data->showname) ? (int)$data->showname : 1,
        'showcustomfields'           => isset($data->showcustomfields) ? (int)$data->showcustomfields : 1,
    ];
    $data->displayoptions = json_encode($displayoptions);

    $sourcetype = $data->sourcetype ?? 'securelibrary';
    if ($sourcetype === 'securelibrary' && !empty($data->mediaid)) {
        $data->videosource = 'securelibrary';
        $media = $DB->get_record('local_securevideolibrary_media', ['id' => $data->mediaid]);
        if ($media) {
            $data->duration = (int)$media->duration;
        }
    } else {
        $data->mediaid = 0;
        $data->videosource = !empty($data->videosource) ? clean_param($data->videosource, PARAM_ALPHAEXT) : 'html5video';
        $data->videourl = clean_param($data->videourl ?? '', PARAM_RAW_TRIMMED);
        $data->duration = isset($data->duration) ? (int)$data->duration : 0;
        $data->posterimage = clean_param($data->posterimage ?? '', PARAM_RAW_TRIMMED);
    }

    $id = $DB->insert_record('smartvideo', $data);

    if (!empty($data->coursemodule)) {
        $context = context_module::instance($data->coursemodule);
        if (isset($data->resources_filemanager)) {
            file_save_draft_area_files(
                $data->resources_filemanager,
                $context->id,
                'mod_smartvideo',
                'resources',
                0,
                ['subdirs' => 0, 'maxfiles' => 10]
            );
        }
        if (isset($data->customposter_filemanager)) {
            file_save_draft_area_files(
                $data->customposter_filemanager,
                $context->id,
                'mod_smartvideo',
                'posterimage',
                0,
                ['subdirs' => 0, 'maxfiles' => 1]
            );
        }
    }

    return $id;
}

/**
 * Update an existing smartvideo instance.
 *
 * @param stdClass $data Post data from the form.
 * @param mod_smartvideo_mod_form|null $mform The form object.
 * @return bool True on success.
 */
function smartvideo_update_instance(stdClass $data, ?mod_smartvideo_mod_form $mform = null): bool {
    global $DB;

    $data->id = $data->instance;
    $data->timemodified = time();

    $data->watermarkenabled = !empty($data->watermarkenabled) ? 1 : 0;
    $data->watermarkopacity = isset($data->watermarkopacity) ? (int)$data->watermarkopacity : 35;
    $data->preventseeking   = !empty($data->preventseeking) ? 1 : 0;
    $data->completionminpercent = isset($data->completionminpercent) ? (int)$data->completionminpercent : 0;
    $data->completionrequirequestions = !empty($data->completionrequirequestions) ? 1 : 0;

    $data->displayinline = isset($data->displayinline) ? (int)$data->displayinline : 1;
    $displayoptions = [
        'usecustomposterimage'       => !empty($data->usecustomposterimage) ? 1 : 0,
        'horizontallayout'           => isset($data->horizontallayout) ? (int)$data->horizontallayout : 1,
        'showprogressbar'            => isset($data->showprogressbar) ? (int)$data->showprogressbar : 1,
        'showcompletionrequirements' => isset($data->showcompletionrequirements) ? (int)$data->showcompletionrequirements : 1,
        'showposterimage'            => isset($data->showposterimage) ? (int)$data->showposterimage : 1,
        'showname'                   => isset($data->showname) ? (int)$data->showname : 1,
        'showcustomfields'           => isset($data->showcustomfields) ? (int)$data->showcustomfields : 1,
    ];
    $data->displayoptions = json_encode($displayoptions);

    $sourcetype = $data->sourcetype ?? 'securelibrary';
    if ($sourcetype === 'securelibrary' && !empty($data->mediaid)) {
        $data->videosource = 'securelibrary';
        $media = $DB->get_record('local_securevideolibrary_media', ['id' => $data->mediaid]);
        if ($media) {
            $data->duration = (int)$media->duration;
        }
    } else {
        $data->mediaid = 0;
        $data->videosource = !empty($data->videosource) ? clean_param($data->videosource, PARAM_ALPHAEXT) : 'html5video';
        $data->videourl = clean_param($data->videourl ?? '', PARAM_RAW_TRIMMED);
        $data->duration = isset($data->duration) ? (int)$data->duration : 0;
        $data->posterimage = clean_param($data->posterimage ?? '', PARAM_RAW_TRIMMED);
    }

    $cmid = $data->coursemodule ?? 0;
    if ($cmid > 0) {
        $context = context_module::instance($cmid);
        if (isset($data->resources_filemanager)) {
            file_save_draft_area_files(
                $data->resources_filemanager,
                $context->id,
                'mod_smartvideo',
                'resources',
                0,
                ['subdirs' => 0, 'maxfiles' => 10]
            );
        }
        if (isset($data->customposter_filemanager)) {
            file_save_draft_area_files(
                $data->customposter_filemanager,
                $context->id,
                'mod_smartvideo',
                'posterimage',
                0,
                ['subdirs' => 0, 'maxfiles' => 1]
            );
        }
    }

    return $DB->update_record('smartvideo', $data);
}

/**
 * Delete an existing smartvideo instance and associated student progress.
 *
 * @param int $id The instance ID.
 * @return bool True on success.
 */
function smartvideo_delete_instance(int $id): bool {
    global $DB;

    if (!$DB->record_exists('smartvideo', ['id' => $id])) {
        return false;
    }

    $DB->delete_records('smartvideo_progress', ['instanceid' => $id]);

    // Clean up Question Engine usages.
    $qubaids = $DB->get_fieldset_select(
        'smartvideo_qattempts',
        'qubaid',
        'instanceid = :instanceid AND qubaid > 0',
        ['instanceid' => $id]
    );

    if (!empty($qubaids)) {
        \question_engine::delete_questions_usage_by_activities(new \qubaid_list($qubaids));
    }

    $DB->delete_records('smartvideo_qattempts', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_questions', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_chapters', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_callouts', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_notes', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_reports', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_subtitles', ['instanceid' => $id]);
    $DB->delete_records('smartvideo_discussions', ['instanceid' => $id]);

    $cm = get_coursemodule_from_instance('smartvideo', $id);
    if ($cm) {
        $context = context_module::instance($cm->id);
        $fs = get_file_storage();
        $fs->delete_area_files($context->id, 'mod_smartvideo', 'resources');
    }

    $DB->delete_records('smartvideo', ['id' => $id]);

    return true;
}

/**
 * Extends the settings navigation to add Interactive Questions and Report tabs for teachers.
 *
 * @param settings_navigation $settingsnav The settings navigation object.
 * @param navigation_node|null $navref The current node reference.
 * @return void
 */
function smartvideo_extend_settings_navigation(
    settings_navigation $settingsnav,
    ?navigation_node $navref = null
): void {
    global $PAGE;

    $cm = $PAGE->cm;
    if (!$cm || $cm->modname !== 'smartvideo' || !$navref) {
        return;
    }

    $context = context_module::instance($cm->id);

    // Interactive Questions tab.
    if (
        has_capability('moodle/course:manageactivities', $context)
        || has_capability('mod/smartvideo:addinstance', $context)
        || has_capability('mod/smartvideo:managequestions', $context)
    ) {
        $questionsurl = new moodle_url('/mod/smartvideo/questions.php', ['id' => $cm->id]);
        $navref->add(
            get_string('interactivequestions', 'mod_smartvideo'),
            $questionsurl,
            settings_navigation::TYPE_SETTING,
            null,
            'smartvideo_questions',
            new pix_icon('i/questions', '')
        );
    }

    // Watch Progress Report tab.
    if (has_capability('mod/smartvideo:viewreports', $context)) {
        $reporturl = new moodle_url('/mod/smartvideo/report.php', ['id' => $cm->id]);
        $navref->add(
            get_string('report', 'mod_smartvideo'),
            $reporturl,
            settings_navigation::TYPE_SETTING,
            null,
            'smartvideo_report',
            new pix_icon('i/report', '')
        );
    }
}

/**
 * Serve files embedded in question text, feedback, or choices.
 *
 * @param stdClass $course Course object.
 * @param stdClass $context Context object.
 * @param string $component Component name (mod_smartvideo).
 * @param string $filearea File area name.
 * @param int $qubaid Question usage ID.
 * @param int $slot Question slot number.
 * @param array $args Extra file path arguments.
 * @param bool $forcedownload Whether forced download is requested.
 * @param array $fileoptions File options.
 * @return void
 */
function smartvideo_question_pluginfile(
    $course,
    $context,
    $component,
    $filearea,
    $qubaid,
    $slot,
    $args,
    $forcedownload,
    $fileoptions
): void {
    global $DB, $USER;

    require_login($course, false);

    $attempt = $DB->get_record('smartvideo_qattempts', ['qubaid' => $qubaid, 'slot' => $slot]);
    if (!$attempt) {
        send_file_not_found();
    }

    $modcontext = context_module::instance($context->instanceid);
    if ($attempt->userid != $USER->id && !has_capability('mod/smartvideo:viewreports', $modcontext)) {
        send_file_not_found();
    }

    $quba = \question_engine::load_questions_usage_by_activity($qubaid);

    $options = new \question_display_options();
    $options->feedback = \question_display_options::VISIBLE;
    $options->generalfeedback = \question_display_options::VISIBLE;
    $options->rightanswer = \question_display_options::VISIBLE;

    if (!$quba->check_file_access($slot, $options, $component, $filearea, $args, $forcedownload)) {
        send_file_not_found();
    }

    $fs = get_file_storage();
    $relativepath = implode('/', $args);
    $fullpath = "/{$context->id}/{$component}/{$filearea}/{$relativepath}";
    $file = $fs->get_file_by_hash(sha1($fullpath));

    if (!$file || $file->is_directory()) {
        send_file_not_found();
    }

    send_stored_file($file, 0, 0, $forcedownload, $fileoptions);
}

/**
 * Obtains the automatic completion state for this module based on custom rules.
 *
 * @param stdClass $course The course object.
 * @param cm_info|stdClass $cm The course module object.
 * @param int $userid The user ID.
 * @param bool $type The completion type.
 * @return bool True if completed, false otherwise.
 */
function smartvideo_get_completion_state(stdClass $course, $cm, int $userid, bool $type): bool {
    global $DB;

    $instance = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

    // Rule 1: Watch percentage.
    if (!empty($instance->completionminpercent)) {
        $progress = $DB->get_record('smartvideo_progress', [
            'instanceid' => $instance->id,
            'userid'     => $userid,
        ]);

        if (!$progress || $progress->percentcompleted < $instance->completionminpercent) {
            return false;
        }
    }

    // Rule 2: Passing all required interactive questions.
    if (!empty($instance->completionrequirequestions)) {
        $totalquestions = $DB->count_records('smartvideo_questions', [
            'instanceid'     => $instance->id,
            'requirecorrect' => 1,
        ]);

        if ($totalquestions > 0) {
            $sql = "SELECT COUNT(qa.id)
                      FROM {smartvideo_qattempts} qa
                      JOIN {smartvideo_questions} sq ON sq.id = qa.svquestionid
                     WHERE qa.instanceid = :instanceid
                       AND qa.userid = :userid
                       AND sq.requirecorrect = 1
                       AND qa.passed = 1";

            $passed = $DB->count_records_sql($sql, [
                'instanceid' => $instance->id,
                'userid'     => $userid,
            ]);

            if ($passed < $totalquestions) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Serves module files (e.g. lecture handouts and resources).
 *
 * @param stdClass $course Course object.
 * @param stdClass $cm Course module object.
 * @param context $context Context object.
 * @param string $filearea File area name.
 * @param array $args Extra file path arguments.
 * @param bool $forcedownload Whether forced download is requested.
 * @param array $options Additional file options.
 * @return bool False if file not found.
 */
function smartvideo_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
): bool {
    if ($context->contextlevel != CONTEXT_MODULE) {
        return false;
    }

    require_login($course, true, $cm);

    if ($filearea !== 'resources' && $filearea !== 'posterimage') {
        return false;
    }

    $itemid = (int)array_shift($args);
    $filename = array_pop($args);
    $filepath = $args ? '/' . implode('/', $args) . '/' : '/';

    $fs = get_file_storage();
    $file = $fs->get_file($context->id, 'mod_smartvideo', $filearea, $itemid, $filepath, $filename);

    if (!$file || $file->is_directory()) {
        return false;
    }

    $lifetime = ($filearea === 'posterimage') ? 86400 : null;
    send_stored_file($file, $lifetime, 0, $forcedownload, $options);
    return true;
}

/**
 * Add course module info for cached_cm_info.
 *
 * @param stdClass $coursemodule The coursemodule object.
 * @return cached_cm_info|false Information object or false.
 */
function smartvideo_get_coursemodule_info($coursemodule) {
    global $DB;

    $fields = 'id, name, intro, introformat, videosource, videourl, duration, '
        . 'posterimage, mediaid, displayinline, displayoptions, completionminpercent';
    $smartvideo = $DB->get_record('smartvideo', ['id' => $coursemodule->instance], $fields);
    if (!$smartvideo) {
        return false;
    }

    $result = new cached_cm_info();
    $result->name = $smartvideo->name;
    if ($coursemodule->showdescription) {
        $result->content = format_module_intro('smartvideo', $smartvideo, $coursemodule->id, false);
    }

    $result->customdata['videosource']          = $smartvideo->videosource;
    $result->customdata['videourl']             = $smartvideo->videourl;
    $result->customdata['duration']             = (int)$smartvideo->duration;
    $result->customdata['posterimage']          = $smartvideo->posterimage;
    $result->customdata['mediaid']              = (int)$smartvideo->mediaid;
    $result->customdata['displayinline']        = isset($smartvideo->displayinline) ? (int)$smartvideo->displayinline : 1;
    $result->customdata['displayoptions']       = $smartvideo->displayoptions ?? '{}';
    $result->customdata['completionminpercent'] = (int)($smartvideo->completionminpercent ?? 0);

    return $result;
}
/**
 * Dynamically updates course module info (hiding standard view link when inline card is active).
 *
 * @param cm_info $cm Course module information.
 * @return void
 */
function smartvideo_cm_info_dynamic(cm_info $cm): void {
    global $PAGE;

    if (strpos($PAGE->bodyclasses, 'path-course-view') === false && $PAGE->pagelayout !== 'course') {
        return;
    }

    $customdata = $cm->customdata ?? [];
    $displayinline = !isset($customdata['displayinline']) || !empty($customdata['displayinline']);

    if ($displayinline) {
        try {
            $cm->set_no_view_link();
        } catch (\Throwable $e) {
            debugging($e->getMessage(), DEBUG_DEVELOPER);
        }
    }
}

/**
 * Callback function to render custom inline activity card on course pages.
 *
 * @param cm_info $cm Course module information.
 * @return void
 */
function smartvideo_cm_info_view(cm_info $cm): void {
    global $PAGE;

    $customdata = $cm->customdata ?? [];
    $displayinline = !isset($customdata['displayinline']) || !empty($customdata['displayinline']);

    $iscoursepage = strpos($PAGE->pagetype, 'course-view-') === 0
        || strpos($PAGE->bodyclasses, 'format-') !== false
        || $PAGE->pagelayout === 'course';
    if ($displayinline && $iscoursepage) {
        $cardhtml = smartvideo_render_course_card($cm);
        if (!empty($cardhtml)) {
            $cm->set_content($cardhtml);
        }
    }
}

/**
 * Renders the rich interactive course card for mod_smartvideo.
 *
 * @param cm_info $cm Course module information.
 * @return string HTML output.
 */
function smartvideo_render_course_card(cm_info $cm): string {
    global $DB, $USER, $PAGE, $OUTPUT;

    $customdata = $cm->customdata ?? [];
    $smartvideo = null;
    if (empty($customdata) || !isset($customdata['videosource'])) {
        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance]);
        if (!$smartvideo) {
            return '';
        }
    }

    $videosource = $customdata['videosource'] ?? ($smartvideo->videosource ?? 'securelibrary');
    $duration = (int)($customdata['duration'] ?? ($smartvideo->duration ?? 0));
    $rawposter = $customdata['posterimage'] ?? ($smartvideo->posterimage ?? '');
    if (!empty($customdata['displayoptions'])) {
        $displayoptions = is_array($customdata['displayoptions'])
            ? $customdata['displayoptions']
            : json_decode($customdata['displayoptions'], true);
    } else if (!empty($smartvideo->displayoptions)) {
        $displayoptions = json_decode($smartvideo->displayoptions, true);
    } else {
        $displayoptions = [];
    }

    $usecustomposter            = !empty($displayoptions['usecustomposterimage']);
    $horizontallayout           = isset($displayoptions['horizontallayout']) ? (int)$displayoptions['horizontallayout'] : 1;
    $showprogressbar            = isset($displayoptions['showprogressbar']) ? (int)$displayoptions['showprogressbar'] : 1;
    $showcompletionrequirements = isset($displayoptions['showcompletionrequirements'])
        ? (int)$displayoptions['showcompletionrequirements'] : 1;
    $showposterimage            = isset($displayoptions['showposterimage']) ? (int)$displayoptions['showposterimage'] : 1;
    $showname                   = isset($displayoptions['showname']) ? (int)$displayoptions['showname'] : 1;
    $showcustomfields           = isset($displayoptions['showcustomfields']) ? (int)$displayoptions['showcustomfields'] : 1;

    $posterurl = '';

    // 1. If custom poster uploaded via filemanager.
    if ($usecustomposter) {
        $fs = get_file_storage();
        $context = context_module::instance($cm->id);
        $files = $fs->get_area_files($context->id, 'mod_smartvideo', 'posterimage', 0, 'filesize DESC', false);
        if ($files) {
            $file = reset($files);
            $posterurl = moodle_url::make_pluginfile_url(
                $file->get_contextid(),
                $file->get_component(),
                $file->get_filearea(),
                $file->get_itemid(),
                $file->get_filepath(),
                $file->get_filename()
            )->out(false);
        }
    }

    // 2. If no custom poster file, check rawposter URL.
    if (empty($posterurl) && !empty($rawposter)) {
        $posterurl = $rawposter;
    }

    // 3. Fallback for Secure Library: thumbnail.jpg from serve.php.
    if (empty($posterurl) && $videosource === 'securelibrary') {
        $mediaid = $customdata['mediaid'] ?? (
            $smartvideo ? $smartvideo->mediaid : $DB->get_field('smartvideo', 'mediaid', ['id' => $cm->instance])
        );
        if (!empty($mediaid)) {
            $posterurl = (new moodle_url('/local/securevideolibrary/serve.php', [
                'mediaid' => (int)$mediaid,
                'cmid'    => (int)$cm->id,
                'file'    => 'thumbnail.jpg',
            ]))->out(false);
        }
    }

    // 4. Fallback for YouTube.
    if (empty($posterurl) && $videosource === 'youtube') {
        $vurl = $customdata['videourl'] ?? (
            $smartvideo ? $smartvideo->videourl : $DB->get_field('smartvideo', 'videourl', ['id' => $cm->instance])
        );
        if (preg_match('/[?&]v=([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/i', $vurl, $ym)) {
            $yid = !empty($ym[1]) ? $ym[1] : $ym[2];
            $posterurl = 'https://img.youtube.com/vi/' . $yid . '/hqdefault.jpg';
        }
    }

    // 5. Ultimate fallback: generated Moodle image or default SVG.
    if (empty($posterurl)) {
        $posterurl = $OUTPUT->get_generated_image_for_id($cm->id);
    }

    // Duration formatting.
    $durationformatted = '';
    if ($duration > 0) {
        $mins = floor($duration / 60);
        $secs = $duration % 60;
        $hours = floor($duration / 3600);
        if ($hours > 0) {
            $mins = floor(($duration % 3600) / 60);
            $durationformatted = sprintf('%02d:%02d:%02d', $hours, $mins, $secs);
        } else {
            $durationformatted = sprintf('%02d:%02d', $mins, $secs);
        }
    }

    // Provider Badge.
    $providers = [
        'securelibrary' => ['name' => 'Secure Library', 'class' => 'bg-secondary'],
        'youtube'       => ['name' => 'YouTube', 'class' => 'bg-danger'],
        'vimeo'         => ['name' => 'Vimeo', 'class' => 'bg-info text-dark'],
        'screenpal'     => ['name' => 'ScreenPal', 'class' => 'bg-primary'],
        'bunnystream'   => ['name' => 'Bunny Stream', 'class' => 'bg-warning text-dark'],
        'vdocipher'     => ['name' => 'VdoCipher', 'class' => 'bg-primary'],
        'dailymotion'   => ['name' => 'Dailymotion', 'class' => 'bg-dark'],
        'wistia'        => ['name' => 'Wistia', 'class' => 'bg-success'],
        'html5video'    => ['name' => 'Video', 'class' => 'bg-secondary'],
    ];
    $pinfo = $providers[$videosource] ?? ['name' => ucfirst($videosource), 'class' => 'bg-secondary'];

    // Student Progress.
    $percentcompleted = 0;
    $completionminpercent = (int)($customdata['completionminpercent'] ?? ($smartvideo->completionminpercent ?? 0));
    $iscompleted = false;

    if (!isguestuser() && isloggedin()) {
        $prog = $DB->get_record('smartvideo_progress', [
            'instanceid' => $cm->instance,
            'userid'     => $USER->id,
        ]);
        if ($prog) {
            $percentcompleted = (int)$prog->percentcompleted;
        }
        if ($completionminpercent > 0 && $percentcompleted >= $completionminpercent) {
            $iscompleted = true;
        } else if ($percentcompleted >= 100) {
            $iscompleted = true;
        }
    }

    // Activity Custom Fields (Repetition & Estimated Study Time).
    $customfields = smartvideo_get_activity_customfields($cm->id, $cm->instance);

    // Completion Requirements.
    $completionhtml = '';
    if ($showcompletionrequirements && !isguestuser() && isloggedin()) {
        $completiondetails = \core_completion\cm_completion_details::get_instance($cm, $USER->id);
        $activitycompletion = new \core_course\output\activity_completion($cm, $completiondetails);
        $renderer = $PAGE->get_renderer('core');
        $completiondata = (array)$activitycompletion->export_for_template($renderer);
        if (!empty($completiondata['hascompletion'])) {
            $completionhtml = $OUTPUT->render_from_template('core_course/activity_info', $completiondata);
        }
    }

    $templatecontext = [
        'cmid'                       => (int)$cm->id,
        'title'                      => format_string($cm->name),
        'url'                        => (new moodle_url('/mod/smartvideo/view.php', ['id' => $cm->id]))->out(false),
        'uservisible'                => (bool)$cm->uservisible,
        'posterimage'                => $posterurl,
        'hasduration'                => ($duration > 0),
        'durationformatted'          => $durationformatted,
        'providername'               => $pinfo['name'],
        'providerbadgeclass'         => $pinfo['class'],
        'horizontallayout'           => (bool)$horizontallayout,
        'showposterimage'            => (bool)$showposterimage,
        'showname'                   => (bool)$showname,
        'showprogressbar'            => (bool)$showprogressbar,
        'showcustomfields'           => (bool)$showcustomfields,
        'hascustomfields'            => !empty($customfields),
        'customfield_repetition'     => $customfields['repetition']['value'] ?? null,
        'customfield_est'            => $customfields['est']['value'] ?? null,
        'percentcompleted'           => $percentcompleted,
        'completionminpercent'       => $completionminpercent,
        'hascompletionrule'          => ($completionminpercent > 0),
        'iscompleted'                => $iscompleted,
        'completionhtml'             => $completionhtml,
    ];

    return $OUTPUT->render_from_template('mod_smartvideo/coursecard', $templatecontext);
}

/**
 * Resolves activity custom fields (specifically Repetition and Estimated Study Time).
 *
 * @param int $cmid Course module ID.
 * @param int $instanceid Activity instance ID.
 * @return array Keyed by shortname ('repetition', 'est').
 */
function smartvideo_get_activity_customfields(int $cmid, int $instanceid): array {
    global $DB;

    $sql = "SELECT f.id, f.shortname, f.name, f.type, f.configdata,
                   d.value, d.charvalue, d.shortcharvalue
            FROM {customfield_field} f
            JOIN {customfield_data} d ON d.fieldid = f.id
            WHERE (d.instanceid = :cmid OR d.instanceid = :instanceid)
              AND f.shortname IN ('repetition', 'est')";

    $records = $DB->get_records_sql($sql, ['cmid' => $cmid, 'instanceid' => $instanceid]);
    $result = [];

    foreach ($records as $r) {
        $val = '';
        if (!empty($r->charvalue)) {
            $val = $r->charvalue;
        } else if (!empty($r->shortcharvalue)) {
            $val = $r->shortcharvalue;
        } else if ($r->value !== null && $r->value !== '') {
            if ($r->type === 'select') {
                $cfg = json_decode($r->configdata ?? '{}');
                if (!empty($cfg->options)) {
                    $opts = preg_split('/\r\n|\r|\n/', trim($cfg->options));
                    $idx = (int)$r->value - 1;
                    $val = $opts[$idx] ?? $r->value;
                } else {
                    $val = $r->value;
                }
            } else {
                $val = $r->value;
            }
        }

        if ($val !== '') {
            $result[$r->shortname] = [
                'name'  => $r->name,
                'value' => $val,
            ];
        }
    }

    return $result;
}
