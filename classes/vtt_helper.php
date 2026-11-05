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

namespace mod_smartvideo;

/**
 * WebVTT subtitle parser and cue extractor helper.
 *
 * @package    mod_smartvideo
 * @copyright  2025 Mohammad Nabil <mohammad@smartlearn.education>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class vtt_helper {
    /**
     * Parse timestamp string (HH:MM:SS.mmm or MM:SS.mmm) into seconds.
     *
     * @param string $timeStr
     * @return float
     */
    public static function parse_time(string $timeStr): float {
        $parts = explode(':', trim($timeStr));
        if (count($parts) === 3) {
            $hours = (float)$parts[0];
            $mins = (float)$parts[1];
            $secs = (float)$parts[2];
            return ($hours * 3600) + ($mins * 60) + $secs;
        } else if (count($parts) === 2) {
            $mins = (float)$parts[0];
            $secs = (float)$parts[1];
            return ($mins * 60) + $secs;
        }
        return (float)$timeStr;
    }

    /**
     * Format seconds into MM:SS display format.
     *
     * @param float $seconds
     * @return string
     */
    public static function format_time(float $seconds): string {
        $s = max(0, floor($seconds));
        $mins = floor($s / 60);
        $secs = $s % 60;
        return sprintf('%02d:%02d', $mins, $secs);
    }

    /**
     * Parse raw WebVTT content into an array of structured cues.
     *
     * @param string $content Raw WebVTT string.
     * @return array List of cue objects.
     */
    public static function parse_vtt(string $content): array {
        $cues = [];
        $lines = preg_split("/\r\n|\n|\r/", trim($content));
        $lineCount = count($lines);

        $i = 0;
        while ($i < $lineCount) {
            $line = trim($lines[$i]);

            // Match WebVTT timing line: 00:00:01.000 --> 00:00:04.000
            if (preg_match('/((?:\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[\.,]\d{3})/', $line, $matches)) {
                $startStr = str_replace(',', '.', $matches[1]);
                $endStr = str_replace(',', '.', $matches[2]);
                $startSec = self::parse_time($startStr);
                $endSec = self::parse_time($endStr);

                $textLines = [];
                $i++;
                while ($i < $lineCount && trim($lines[$i]) !== '') {
                    $textLines[] = trim($lines[$i]);
                    $i++;
                }

                $rawText = implode(' ', $textLines);
                // Strip HTML-like voice tags <v ...> and formatting <b>, <i>, <u>
                $cleanText = strip_tags($rawText);

                if (!empty($cleanText)) {
                    $cues[] = [
                        'start'          => round($startSec, 2),
                        'end'            => round($endSec, 2),
                        'startformatted' => self::format_time($startSec),
                        'endformatted'   => self::format_time($endSec),
                        'text'           => $cleanText,
                    ];
                }
            }
            $i++;
        }

        return $cues;
    }
}
