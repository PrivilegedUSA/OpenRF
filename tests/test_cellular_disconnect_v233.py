import unittest
from unittest.mock import Mock
from openrf.server import Handler


class CellularDisconnectTest(unittest.TestCase):
    def test_client_disconnect_during_headers_or_body(self):
        for error in (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            for during in ('headers', 'body'):
                with self.subTest(error=error, during=during):
                    handler = Mock()
                    handler.close_connection = False
                    target = handler.end_headers if during == 'headers' else handler.wfile.write
                    target.side_effect = error('client disconnected')
                    Handler._send(handler, 200, b'{}', 'application/json')
                    self.assertTrue(handler.close_connection)
                    handler.send_response.assert_called_once_with(200)
                    if during == 'headers': handler.wfile.write.assert_not_called()

    def test_other_io_errors_still_propagate(self):
        handler = Mock()
        handler.wfile.write.side_effect = OSError('unrelated failure')
        with self.assertRaises(OSError):
            Handler._send(handler, 200, b'{}', 'application/json')
