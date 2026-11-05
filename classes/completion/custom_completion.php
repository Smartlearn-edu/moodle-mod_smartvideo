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

namespace mod_smartvideo\completion;

use core_completion\activity_custom_completion;

/**
 * Activity custom completion implementation for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class custom_completion extends activity_custom_completion {
    /**
     * Fetches the completion state for a given custom completion rule.
     *
     * @param string $rule The completion rule.
     * @return int The completion state (COMPLETION_COMPLETE or COMPLETION_INCOMPLETE).
     */
    public function get_state(string $rule): int {
        global $DB;

        $this->validate_rule($rule);

        $instance = $DB->get_record('smartvideo', ['id' => $this->cm->instance], '*', MUST_EXIST);

        if ($rule === 'completionminpercent') {
            if (empty($instance->completionminpercent)) {
                return COMPLETION_COMPLETE;
            }

            $progress = $DB->get_record('smartvideo_progress', [
                'instanceid' => $instance->id,
                'userid'     => $this->userid,
            ]);

            if ($progress && $progress->percentcompleted >= $instance->completionminpercent) {
                return COMPLETION_COMPLETE;
            }
        } else if ($rule === 'completionrequirequestions') {
            if (empty($instance->completionrequirequestions)) {
                return COMPLETION_COMPLETE;
            }

            $totalquestions = $DB->count_records('smartvideo_questions', [
                'instanceid'     => $instance->id,
                'requirecorrect' => 1,
            ]);

            if ($totalquestions === 0) {
                return COMPLETION_COMPLETE;
            }

            $sql = "SELECT COUNT(qa.id)
                      FROM {smartvideo_qattempts} qa
                      JOIN {smartvideo_questions} sq ON sq.id = qa.svquestionid
                     WHERE qa.instanceid = :instanceid
                       AND qa.userid = :userid
                       AND sq.requirecorrect = 1
                       AND qa.passed = 1";

            $passed = $DB->count_records_sql($sql, [
                'instanceid' => $instance->id,
                'userid'     => $this->userid,
            ]);

            if ($passed >= $totalquestions) {
                return COMPLETION_COMPLETE;
            }
        }

        return COMPLETION_INCOMPLETE;
    }

    /**
     * Fetch the list of custom completion rules defined for this module.
     *
     * @return array
     */
    public static function get_defined_custom_rules(): array {
        return [
            'completionminpercent',
            'completionrequirequestions',
        ];
    }

    /**
     * Returns an associative array of the descriptions of custom completion rules.
     *
     * @return array
     */
    public function get_custom_rule_descriptions(): array {
        global $DB;

        $instance = $DB->get_record('smartvideo', ['id' => $this->cm->instance], '*', MUST_EXIST);
        $totalquestions = $DB->count_records('smartvideo_questions', [
            'instanceid'     => $instance->id,
            'requirecorrect' => 1,
        ]);

        return [
            'completionminpercent' => get_string(
                'completionminpercent_desc',
                'mod_smartvideo',
                $instance->completionminpercent
            ),
            'completionrequirequestions' => get_string(
                'completionrequirequestions_desc',
                'mod_smartvideo',
                $totalquestions
            ),
        ];
    }

    /**
     * Returns an array of rule sorting order.
     *
     * @return array
     */
    public function get_sort_order(): array {
        return [
            'completionview',
            'completionminpercent',
            'completionrequirequestions',
        ];
    }
}
