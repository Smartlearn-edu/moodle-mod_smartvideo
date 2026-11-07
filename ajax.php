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
 * AJAX endpoints for external video provider metadata, oEmbed and OTP proxy.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/filelib.php');

$action = required_param('action', PARAM_ALPHAEXT);

require_login();
require_sesskey();

header('Content-Type: application/json; charset=utf-8');

switch ($action) {
    case 'get_from_url':
        $url = required_param('url', PARAM_URL);

        // Security check: only allow safe external video oEmbed domains.
        $parsed = parse_url($url);
        $host = strtolower($parsed['host'] ?? '');
        $allowedhosts = [
            'video.bunnycdn.com',
            'fast.wistia.com',
            'vimeo.com',
            'www.vimeo.com',
            'api.dailymotion.com',
            'www.dailymotion.com',
        ];

        $matched = false;
        foreach ($allowedhosts as $allowed) {
            if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
                $matched = true;
                break;
            }
        }

        if (!$matched) {
            echo json_encode(['error' => 'Domain not allowed in proxy']);
            exit;
        }

        $curl = new curl(['ignoresecurity' => true]);
        $curl->setHeader('Content-Type: application/json');
        $curl->setHeader('Accept: application/json');
        $response = $curl->get($url);

        if (!$response) {
            echo json_encode(['error' => 'No response from remote service']);
            exit;
        }

        echo $response;
        break;

    case 'get_vdocipher':
        $key = get_config('mod_smartvideo', 'auth_vdocipher');
        if (empty($key)) {
            echo json_encode(['error' => get_string('vdocipher_apikey_missing', 'mod_smartvideo')]);
            exit;
        }

        $videoid = required_param('videoid', PARAM_ALPHANUMEXT);
        $info = optional_param('info', 'otp', PARAM_ALPHA);

        $curl = new curl(['ignoresecurity' => true]);
        $curl->setHeader('Accept: application/json');
        $curl->setHeader('Authorization: Apisecret ' . $key);
        $curl->setHeader('Content-Type: application/json');

        if ($info === 'otp') {
            $endpoint = "https://www.vdocipher.com/api/videos/{$videoid}/otp";
            $payload = json_encode([
                'ttl' => 2592000, // 30 days.
            ]);
            $response = $curl->post($endpoint, $payload);
        } else {
            $endpoint = "https://www.vdocipher.com/api/videos/{$videoid}";
            $response = $curl->get($endpoint);
        }

        if (!$response) {
            echo json_encode(['error' => 'No response from VdoCipher API']);
            exit;
        }

        echo $response;
        break;

    default:
        echo json_encode(['error' => 'Invalid action']);
        break;
}
