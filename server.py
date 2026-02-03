#!/usr/bin/env python3
"""Simple HTTP server for Claire Delish realtime app"""

import http.server
import ssl
import os
import sys

PORT = int(os.environ.get('PORT', 8080))

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with http.server.HTTPServer(('', PORT), CORSHandler) as httpd:
        print(f'🍳 Claire Delish running at http://localhost:{PORT}')
        print(f'Press Ctrl+C to stop')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down...')
