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

namespace mod_smartvideo\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use stdClass;

/**
 * External web service to update student video watch progress and trigger completion.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class update_progress extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'             => new external_value(PARAM_INT, 'Course module ID'),
            'currentposition'  => new external_value(PARAM_INT, 'Current playback position in seconds', VALUE_DEFAULT, 0),
            'maxposition'      => new external_value(PARAM_INT, 'Furthest playback position reached in seconds', VALUE_DEFAULT, 0),
            'watchedseconds'   => new external_value(PARAM_INT, 'Unique seconds watched', VALUE_DEFAULT, 0),
            'watchedintervals' => new external_value(PARAM_RAW, 'JSON encoded array of watched intervals', VALUE_DEFAULT, '[]'),
        ]);
    }

    /**
     * Execute progress update.
     *
     * @param int $cmid Course module ID.
     * @param int $currentposition Current position in seconds.
     * @param int $maxposition Furthest position reached.
     * @param int $watchedseconds Unique seconds watched.
     * @param string $watchedintervals JSON intervals string.
     * @return array
     */
    public static function execute(
        int $cmid,
        int $currentposition = 0,
        int $maxposition = 0,
        int $watchedseconds = 0,
        string $watchedintervals = '[]'
    ): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'             => $cmid,
            'currentposition'  => $currentposition,
            'maxposition'      => $maxposition,
            'watchedseconds'   => $watchedseconds,
            'watchedintervals' => $watchedintervals,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/smartvideo:view', $context);

        $instance = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);
        $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);

        $media = $DB->get_record('local_securevideolibrary_media', ['id' => $instance->mediaid]);
        $duration = $media ? (int)$media->duration : 0;

        $percentcompleted = 0;
        if ($duration > 0) {
            $percentcompleted = (int)min(100, round(($params['watchedseconds'] / $duration) * 100));
        }

        $now = time();
        $progress = $DB->get_record('smartvideo_progress', [
            'instanceid' => $instance->id,
            'userid'     => $USER->id,
        ]);

        if ($progress) {
            $progress->lastposition     = max(0, $params['currentposition']);
            $progress->maxposition      = max((int)$progress->maxposition, $params['maxposition']);
            $progress->watchedseconds   = max((int)$progress->watchedseconds, $params['watchedseconds']);
            $progress->watchedintervals = $params['watchedintervals'];
            $progress->percentcompleted = max((int)$progress->percentcompleted, $percentcompleted);
            $progress->timemodified     = $now;
            $DB->update_record('smartvideo_progress', $progress);
        } else {
            $newrec = new stdClass();
            $newrec->instanceid       = $instance->id;
            $newrec->userid           = $USER->id;
            $newrec->lastposition     = max(0, $params['currentposition']);
            $newrec->maxposition      = max(0, $params['maxposition']);
            $newrec->watchedseconds   = max(0, $params['watchedseconds']);
            $newrec->watchedintervals = $params['watchedintervals'];
            $newrec->percentcompleted = $percentcompleted;
            $newrec->timemodified     = $now;
            $DB->insert_record('smartvideo_progress', $newrec);
        }

        // Completion evaluation.
        $iscompleted = false;
        if (!empty($instance->completionminpercent)) {
            $completion = new \completion_info($course);
            if ($completion->is_enabled($cm)) {
                $finalpercent = $progress ? (int)$progress->percentcompleted : $percentcompleted;
                if ($finalpercent >= (int)$instance->completionminpercent) {
                    $completion->update_state($cm, COMPLETION_COMPLETE, $USER->id);
                    $iscompleted = true;
                }
            }
        }

        return [
            'status'           => true,
            'percentcompleted' => $progress ? (int)$progress->percentcompleted : $percentcompleted,
            'iscompleted'      => $iscompleted,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status'           => new external_value(PARAM_BOOL, 'Status of update operation'),
            'percentcompleted' => new external_value(PARAM_INT, 'Current watch percentage'),
            'iscompleted'      => new external_value(PARAM_BOOL, 'Whether minimum watch completion is met'),
        ]);
    }
}
