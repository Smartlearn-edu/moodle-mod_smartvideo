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

defined('MOODLE_INTERNAL') || die();

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

    if (!empty($data->coursemodule) && isset($data->resources_filemanager)) {
        $context = context_module::instance($data->coursemodule);
        file_save_draft_area_files(
            $data->resources_filemanager,
            $context->id,
            'mod_smartvideo',
            'resources',
            0,
            ['subdirs' => 0, 'maxfiles' => 10]
        );
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
    if ($cmid > 0 && isset($data->resources_filemanager)) {
        $context = context_module::instance($cmid);
        file_save_draft_area_files(
            $data->resources_filemanager,
            $context->id,
            'mod_smartvideo',
            'resources',
            0,
            ['subdirs' => 0, 'maxfiles' => 10]
        );
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

    if ($filearea !== 'resources') {
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

    send_stored_file($file, null, 0, $forcedownload, $options);
    return true;
}


