"""Offline-first RTL-SDR capability report. No device is opened by status checks.

A visible rtl_power binary enables an opt-in bounded capture request, not proof
of a connected receiver or any measured RF activity.
"""
from __future__ import annotations

import shutil
from datetime import datetime, timezone

SPECTRUM_CONTRACT_VERSION = 1


def capability_report(*, executable_lookup=None, collected_at=None) -> dict:
    lookup = executable_lookup or shutil.which
    rtl_power = bool(lookup('rtl_power'))
    rtl_test = bool(lookup('rtl_test'))
    return {
        'schema_version': SPECTRUM_CONTRACT_VERSION,
        'collected_at_utc': collected_at or datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'mode': 'USER_STARTED_BOUNDED_CAPTURE_AVAILABLE' if rtl_power else 'OFFLINE_FILE_ANALYSIS_ONLY',
        'hardware_capture_enabled': rtl_power,
        'hardware_confirmed': False,
        'tooling': {
            'rtl_power_installed': rtl_power,
            'rtl_test_installed': rtl_test,
            'status': 'tools_present_unverified' if rtl_power or rtl_test else 'tools_not_found',
        },
        'driver_contract': {
            'format': 'rtl_power_csv_v1',
            'source_type': 'operator_selected_local_file',
            'expected_columns': ['date', 'time', 'start_hz', 'stop_hz', 'step_hz', 'sample_count', 'power_db_bins'],
            'frequency_unit': 'Hz in source; MHz in display',
            'amplitude_unit': 'rtl_power reported dB (NOT calibrated dBm)',
            'timestamp_note': 'CSV date/time timezone is not verified; never assume UTC',
            'no_source_location': True,
            'live_sampling': 'USER_STARTED_BOUNDED_RTL_POWER_ONLY; NO CONTINUOUS LIVE PREVIEW',
            'future_receiver_fields': ['receiver_identity', 'driver', 'sample_utc', 'sample_age_seconds', 'center_hz', 'span_hz', 'gain_db', 'calibration_status'],
        },
        'privacy': {'upload_required': False, 'data_stored_on_server': True,
                    'storage_scope': 'explicit_user_requested_captures_only',
                    'offline_csv_view_stored_on_server': False,
                    'automatic_background_collection': False},
        'limitations': [
            'Viewing a CSV is offline analysis, not proof of present radio activity.',
            'DEMO bins are artificial, never recorded observations or live RF detections.',
            'An installed rtl_power tool does not establish that any USB receiver is attached or supported.',
            'Display frequency controls only filter the view; separate capture settings request an explicit receiver sweep.',
            'rtl_power CSV row times have unverified timezone and dB values are not calibrated dBm.',
        ],
    }
