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

/**
 * External web service to fetch a student's structured medical/case inspection report.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_report extends external_api {
    /**
     * Parameter definitions.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid'   => new external_value(PARAM_INT, 'Course module ID'),
            'userid' => new external_value(PARAM_INT, 'User ID (0 for current user)', VALUE_DEFAULT, 0),
        ]);
    }

    /**
     * Execute get report.
     *
     * @param int $cmid Course module ID.
     * @param int $userid Target user ID.
     * @return array
     */
    public static function execute(int $cmid, int $userid = 0): array {
        global $DB, $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid'   => $cmid,
            'userid' => $userid,
        ]);

        $cm = get_coursemodule_from_id('smartvideo', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        $targetuserid = (!empty($params['userid']) && $params['userid'] > 0) ? $params['userid'] : $USER->id;

        if ($targetuserid !== $USER->id) {
            require_capability('mod/smartvideo:managequestions', $context);
        } else {
            require_capability('mod/smartvideo:view', $context);
        }

        $smartvideo = $DB->get_record('smartvideo', ['id' => $cm->instance], '*', MUST_EXIST);

        $report = $DB->get_record('smartvideo_reports', [
            'instanceid' => $smartvideo->id,
            'userid'     => $targetuserid,
        ]);

        if ($report) {
            return [
                'id'              => (int)$report->id,
                'hasreport'       => true,
                'findings'        => $report->findings ?? '',
                'impression'      => $report->impression ?? '',
                'diagnosis'       => $report->diagnosis ?? '',
                'recommendations' => $report->recommendations ?? '',
                'status'          => $report->status ?? 'draft',
                'timemodified'    => (int)$report->timemodified,
            ];
        }

        return [
            'id'              => 0,
            'hasreport'       => false,
            'findings'        => '',
            'impression'      => '',
            'diagnosis'       => '',
            'recommendations' => '',
            'status'          => 'draft',
            'timemodified'    => 0,
        ];
    }

    /**
     * Return structure definition.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'id'              => new external_value(PARAM_INT, 'Report ID'),
            'hasreport'       => new external_value(PARAM_BOOL, 'Whether a report exists'),
            'findings'        => new external_value(PARAM_RAW, 'Findings text'),
            'impression'      => new external_value(PARAM_RAW, 'Impression text'),
            'diagnosis'       => new external_value(PARAM_RAW, 'Diagnosis text'),
            'recommendations' => new external_value(PARAM_RAW, 'Recommendations text'),
            'status'          => new external_value(PARAM_ALPHA, 'Status: draft or submitted'),
            'timemodified'    => new external_value(PARAM_INT, 'Last modified timestamp'),
        ]);
    }
}
