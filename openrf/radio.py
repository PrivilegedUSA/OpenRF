"""Optional RTL-SDR receive-only audio clips (not live streaming).

A user starts one bounded rtl_fm receive operation. The resulting uncalibrated,
undecoded PCM audio is converted to a mono WAV held only in process memory for
one playback. No audio is saved to a file, uploaded or collected on startup.
Only local executables and fixed arguments are used; receiver presence, band
coverage and actual reception are never inferred from a successful subprocess.
"""
from __future__ import annotations

import io
import math
import secrets
import shutil
import subprocess
import threading
import wave
from datetime import datetime, timezone

MIN_FREQ_MHZ, MAX_FREQ_MHZ = 24, 1766  # conservative software guard, NOT receiver coverage
MAX_PCM_BYTES = 2 * 1024 * 1024
MAX_DURATION = 15


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


class RadioError(Exception):
    def __init__(self, message, code='radio_unavailable', status=409):
        super().__init__(message)
        self.code, self.status = code, status


def validate_radio_settings(settings):
    if not isinstance(settings, dict) or set(settings) != {'frequency_mhz', 'mode', 'duration_seconds'}:
        raise RadioError('Provide frequency_mhz, mode and duration_seconds only.', 'invalid_radio_settings', 400)
    freq, mode, duration = (settings['frequency_mhz'], settings['mode'], settings['duration_seconds'])
    if isinstance(freq, bool) or not isinstance(freq, (int, float)) or not math.isfinite(freq):
        raise RadioError('Frequency must be a finite number.', 'invalid_radio_settings', 400)
    if not MIN_FREQ_MHZ <= freq <= MAX_FREQ_MHZ or round(freq * 1_000_000) != freq * 1_000_000:
        raise RadioError('Use 24–1766 MHz, with up to 6 decimal places (hardware coverage unverified).', 'invalid_radio_settings', 400)
    if mode not in ('nfm', 'am', 'wfm') or not isinstance(mode, str):
        raise RadioError('Choose NFM, AM or WFM only.', 'invalid_radio_settings', 400)
    if type(duration) is not int or not 5 <= duration <= MAX_DURATION:
        raise RadioError('Receive duration must be a whole number from 5 to 15 seconds.', 'invalid_radio_settings', 400)
    return {'frequency_mhz': round(float(freq), 6), 'mode': mode, 'duration_seconds': duration}


def pcm_to_wav(pcm: bytes, sample_rate: int) -> bytes:
    if len(pcm) < 2 or len(pcm) > MAX_PCM_BYTES or len(pcm) % 2:
        raise RadioError('rtl_fm returned no valid bounded PCM audio.', 'invalid_radio_audio')
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return buf.getvalue()


class RadioReceiver:
    def __init__(self, *, lookup=None, popen=None):
        self.lookup = lookup or shutil.which
        self.popen = popen or subprocess.Popen
        self.lock = threading.RLock()
        self.active = None
        self.last = None
        self.process = None
        self.wav = None
        self.closed = False
        self.stop_requested = False

    def _public(self, record):
        return dict(record) if record else None

    def status(self):
        with self.lock:
            return {'current': self._public(self.active or self.last),
                    'running': bool(self.active), 'rtl_fm_available': bool(self.lookup('rtl_fm')),
                    'receiver_verified': False, 'audio_delivery': 'BOUNDED_PLAYBACK_NOT_LIVE',
                    'transmit_supported': False, 'saved_to_disk': False}

    def start(self, settings):
        settings = validate_radio_settings(settings)
        with self.lock:
            if self.closed:
                raise RadioError('Radio is shutting down.')
            if self.active:
                raise RadioError('A receive operation is already in progress.', 'radio_busy')
            tool = self.lookup('rtl_fm')
            if not tool:
                raise RadioError('rtl_fm is not installed in this Linux environment. Install rtl-sdr and connect a compatible USB receiver.', 'rtl_fm_missing', 503)
            frequency_hz = int(round(settings['frequency_mhz'] * 1_000_000))
            mode = settings['mode']
            rate = 32000 if mode == 'wfm' else 24000
            argv = [tool, '-d', '0', '-f', str(frequency_hz)]
            if mode == 'wfm':
                argv += ['-M', 'wbfm', '-s', '170000', '-o', '4', '-A', 'fast', '-r', '32000', '-l', '0', '-E', 'deemp']
            else:
                argv += ['-M', 'fm' if mode == 'nfm' else 'am', '-s', '24000', '-r', '24000', '-l', '0']
            argv.append('-')
            record = {'id': secrets.token_hex(8), 'state': 'RUNNING', 'settings': settings,
                      'started_at_utc': now_utc(), 'audio_source': 'RTL_FM_RECEIVE_ONLY',
                      'receiver_verified': False}
            try:
                process = self.popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, close_fds=True)
            except OSError as exc:
                raise RadioError('Could not start rtl_fm. Check USB receiver access in Linux.', 'radio_start_failed', 503) from exc
            self.process, self.active, self.wav, self.stop_requested = process, record, None, False
            threading.Thread(target=self._finish, args=(process, record, rate), daemon=True).start()
            return self._public(record)

    def _finish(self, process, record, rate):
        timed_out = False
        try:
            try:
                output, error = process.communicate(timeout=record['settings']['duration_seconds'])
            except subprocess.TimeoutExpired:
                timed_out = True
                process.terminate()
                try:
                    output, error = process.communicate(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    output, error = process.communicate(timeout=2)
            output = output or b''
            with self.lock:
                stopped = self.stop_requested or self.closed
            if stopped:
                state, audio, message = 'STOPPED', None, 'Stopped by operator; incomplete audio discarded.'
            elif not timed_out and process.returncode != 0:
                state, audio, message = 'FAILED', None, 'rtl_fm exited with an error. Check dongle access, driver and frequency.'
            else:
                try:
                    audio = pcm_to_wav(output[:MAX_PCM_BYTES + 2], rate) if len(output) <= MAX_PCM_BYTES else None
                    if audio is None:
                        raise RadioError('Audio output exceeded the safety limit.')
                    state, message = 'READY', None
                except RadioError:
                    state, audio, message = 'FAILED', None, 'No usable PCM audio. Check compatible hardware and tuning.'
        except (OSError, ValueError, subprocess.SubprocessError):
            state, audio, message = 'FAILED', None, 'rtl_fm receive operation failed.'
            try:
                process.kill()
                process.communicate(timeout=2)
            except (OSError, subprocess.SubprocessError):
                pass
        with self.lock:
            record['state'] = state
            record['finished_at_utc'] = now_utc()
            if state == 'READY':
                record['duration_label'] = 'Short user-started sample; not a live stream'
                record['audio_bytes'] = len(audio)
            else:
                record['error'] = message
            if self.active is record:
                self.last, self.active, self.wav, self.process = record, None, audio, None

    def stop(self):
        with self.lock:
            if not self.active:
                raise RadioError('No radio receive operation is running.', 'radio_not_running')
            self.stop_requested = True
            process = self.process
            record = self._public(self.active)
        if process:
            try:
                process.terminate()
            except OSError:
                pass
        return record

    def audio(self, ident):
        with self.lock:
            if not isinstance(ident, str) or len(ident) != 16 or not all(ch in '0123456789abcdef' for ch in ident):
                raise RadioError('Invalid audio identifier.', 'invalid_audio_id', 400)
            if not self.last or self.last.get('state') != 'READY' or self.last['id'] != ident or not self.wav:
                raise RadioError('This audio sample is unavailable; start a new receive sample.', 'audio_not_available', 404)
            return bytes(self.wav)

    def close(self):
        with self.lock:
            self.closed = True
            self.stop_requested = True
            self.wav = None
            process = self.process
        if process:
            try:
                process.terminate()
                process.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                try:
                    process.kill()
                except OSError:
                    pass
