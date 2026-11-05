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

namespace mod_smartvideo\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\userlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\writer;
use core_privacy\local\request\transform;
use context_module;
use question_engine;
use qubaid_list;

/**
 * Privacy API provider for mod_smartvideo.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\core_userlist_provider,
    \core_privacy\local\request\plugin\provider {
    /**
     * Return metadata about user data stored by this plugin.
     *
     * @param collection $collection The collection to add metadata to.
     * @return collection The updated collection.
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_database_table(
            'smartvideo_progress',
            [
                'userid'           => 'privacy:metadata:smartvideo_progress:userid',
                'lastposition'     => 'privacy:metadata:smartvideo_progress:lastposition',
                'maxposition'      => 'privacy:metadata:smartvideo_progress:maxposition',
                'watchedseconds'   => 'privacy:metadata:smartvideo_progress:watchedseconds',
                'percentcompleted' => 'privacy:metadata:smartvideo_progress:percentcompleted',
                'timemodified'     => 'privacy:metadata:smartvideo_progress:timemodified',
            ],
            'privacy:metadata:smartvideo_progress'
        );

        $collection->add_database_table(
            'smartvideo_qattempts',
            [
                'userid'        => 'privacy:metadata:smartvideo_qattempts:userid',
                'svquestionid'  => 'privacy:metadata:smartvideo_qattempts:svquestionid',
                'passed'        => 'privacy:metadata:smartvideo_qattempts:passed',
                'attempts'      => 'privacy:metadata:smartvideo_qattempts:attempts',
                'fraction'      => 'privacy:metadata:smartvideo_qattempts:fraction',
                'timemodified'  => 'privacy:metadata:smartvideo_qattempts:timemodified',
            ],
            'privacy:metadata:smartvideo_qattempts'
        );

        $collection->link_subsystem('core_question', 'privacy:metadata:core_question');

        return $collection;
    }

    /**
     * Get the list of contexts where user has data.
     *
     * @param int $userid The user to search.
     * @return contextlist
     */
    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();

        $sql = "SELECT cm.id
                  FROM {course_modules} cm
                  JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                  JOIN {smartvideo} p ON p.id = cm.instance
             LEFT JOIN {smartvideo_progress} prog ON prog.instanceid = p.id AND prog.userid = :userid1
             LEFT JOIN {smartvideo_qattempts} qatt ON qatt.instanceid = p.id AND qatt.userid = :userid2
                 WHERE prog.id IS NOT NULL OR qatt.id IS NOT NULL";

        $contextlist->add_from_sql($sql, [
            'modname' => 'smartvideo',
            'userid1' => $userid,
            'userid2' => $userid,
        ]);

        return $contextlist;
    }

    /**
     * Get the list of users within a specific context.
     *
     * @param userlist $userlist The userlist to add to.
     * @return void
     */
    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();

        if (!$context instanceof context_module) {
            return;
        }

        $sqlprog = "SELECT prog.userid
                      FROM {course_modules} cm
                      JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                      JOIN {smartvideo} p ON p.id = cm.instance
                      JOIN {smartvideo_progress} prog ON prog.instanceid = p.id
                     WHERE cm.id = :cmid";

        $userlist->add_from_sql('userid', $sqlprog, [
            'modname' => 'smartvideo',
            'cmid'    => $context->instanceid,
        ]);

        $sqlq = "SELECT qatt.userid
                   FROM {course_modules} cm
                   JOIN {modules} m ON m.id = cm.module AND m.name = :modname
                   JOIN {smartvideo} p ON p.id = cm.instance
                   JOIN {smartvideo_qattempts} qatt ON qatt.instanceid = p.id
                  WHERE cm.id = :cmid";

        $userlist->add_from_sql('userid', $sqlq, [
            'modname' => 'smartvideo',
            'cmid'    => $context->instanceid,
        ]);
    }

    /**
     * Export all user data for the specified user in the specified contexts.
     *
     * @param approved_contextlist $contextlist
     * @return void
     */
    public static function export_user_data(approved_contextlist $contextlist): void {
        global $DB;

        $user = $contextlist->get_user();

        foreach ($contextlist->get_contexts() as $context) {
            if (!$context instanceof context_module) {
                continue;
            }

            $cm = get_coursemodule_from_id('smartvideo', $context->instanceid);
            if (!$cm) {
                continue;
            }

            $progress = $DB->get_record('smartvideo_progress', [
                'instanceid' => $cm->instance,
                'userid'     => $user->id,
            ]);

            if ($progress) {
                $data = (object)[
                    'lastposition'     => $progress->lastposition,
                    'maxposition'      => $progress->maxposition,
                    'watchedseconds'   => $progress->watchedseconds,
                    'percentcompleted' => $progress->percentcompleted,
                    'timemodified'     => transform::datetime($progress->timemodified),
                ];

                writer::with_context($context)->export_data(
                    [get_string('pluginname', 'mod_smartvideo'), 'progress'],
                    $data
                );
            }

            // Export question attempts.
            $attempts = $DB->get_records('smartvideo_qattempts', [
                'instanceid' => $cm->instance,
                'userid'     => $user->id,
            ]);

            if ($attempts) {
                $attemptdata = [];
                foreach ($attempts as $attempt) {
                    $attemptdata[] = (object)[
                        'svquestionid' => $attempt->svquestionid,
                        'passed'       => transform::yesno($attempt->passed),
                        'attempts'     => $attempt->attempts,
                        'fraction'     => $attempt->fraction,
                        'timemodified' => transform::datetime($attempt->timemodified),
                    ];
                }

                writer::with_context($context)->export_data(
                    [get_string('pluginname', 'mod_smartvideo'), 'question_attempts'],
                    (object)['attempts' => $attemptdata]
                );
            }
        }
    }

    /**
     * Delete all data for all users in the specified context.
     *
     * @param \context $context
     * @return void
     */
    public static function delete_data_for_all_users_in_context(\context $context): void {
        global $DB;

        if (!$context instanceof context_module) {
            return;
        }

        $cm = get_coursemodule_from_id('smartvideo', $context->instanceid);
        if ($cm) {
            $DB->delete_records('smartvideo_progress', ['instanceid' => $cm->instance]);

            $qubaids = $DB->get_fieldset_select(
                'smartvideo_qattempts',
                'qubaid',
                'instanceid = :instanceid AND qubaid > 0',
                ['instanceid' => $cm->instance]
            );

            if (!empty($qubaids)) {
                question_engine::delete_questions_usage_by_activities(new qubaid_list($qubaids));
            }

            $DB->delete_records('smartvideo_qattempts', ['instanceid' => $cm->instance]);
        }
    }

    /**
     * Delete user data for a specific user in the specified contexts.
     *
     * @param approved_contextlist $contextlist
     * @return void
     */
    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        global $DB;

        $user = $contextlist->get_user();

        foreach ($contextlist->get_contexts() as $context) {
            if (!$context instanceof context_module) {
                continue;
            }

            $cm = get_coursemodule_from_id('smartvideo', $context->instanceid);
            if ($cm) {
                $DB->delete_records('smartvideo_progress', [
                    'instanceid' => $cm->instance,
                    'userid'     => $user->id,
                ]);

                $qubaids = $DB->get_fieldset_select(
                    'smartvideo_qattempts',
                    'qubaid',
                    'instanceid = :instanceid AND userid = :userid AND qubaid > 0',
                    ['instanceid' => $cm->instance, 'userid' => $user->id]
                );

                if (!empty($qubaids)) {
                    question_engine::delete_questions_usage_by_activities(new qubaid_list($qubaids));
                }

                $DB->delete_records('smartvideo_qattempts', [
                    'instanceid' => $cm->instance,
                    'userid'     => $user->id,
                ]);
            }
        }
    }

    /**
     * Delete multiple users within a single context.
     *
     * @param approved_userlist $userlist
     * @return void
     */
    public static function delete_data_for_users(approved_userlist $userlist): void {
        global $DB;

        $context = $userlist->get_context();
        if (!$context instanceof context_module) {
            return;
        }

        $cm = get_coursemodule_from_id('smartvideo', $context->instanceid);
        if (!$cm) {
            return;
        }

        $userids = $userlist->get_userids();
        if (empty($userids)) {
            return;
        }

        [$insql, $params] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED);
        $params['instanceid'] = $cm->instance;

        $DB->delete_records_select(
            'smartvideo_progress',
            "instanceid = :instanceid AND userid $insql",
            $params
        );

        $qubaids = $DB->get_fieldset_select(
            'smartvideo_qattempts',
            'qubaid',
            "instanceid = :instanceid AND userid $insql AND qubaid > 0",
            $params
        );

        if (!empty($qubaids)) {
            question_engine::delete_questions_usage_by_activities(new qubaid_list($qubaids));
        }

        $DB->delete_records_select(
            'smartvideo_qattempts',
            "instanceid = :instanceid AND userid $insql",
            $params
        );
    }
}
