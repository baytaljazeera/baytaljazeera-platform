"""
Flask API Server for BaytAlJazeera Video Worker
Wraps video_engine.py and handles file transfers from URLs
"""

import os
import requests
import tempfile
from flask import Flask, request, send_file, jsonify
from video_engine import generate_property_video

app = Flask(__name__)

def download_image(url):
    """Download image from URL to local temp file."""
    if url.startswith('http'):
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tf:
                r = requests.get(url, timeout=30)
                r.raise_for_status()
                tf.write(r.content)
                return tf.name
        except Exception as e:
            print(f"Error downloading image {url}: {e}")
            return None
    return url

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for Render."""
    return jsonify({"status": "healthy", "service": "video-worker"})

@app.route('/generate', methods=['POST'])
def generate():
    """
    Generate property video from images.
    
    Request JSON:
    {
        "images": ["https://cloudinary.com/img1.jpg", "https://cloudinary.com/img2.jpg"],
        "tier": "tier1_safwa" | "tier2_business",
        "ambience": "none" | "birds" | "sea",
        "property": {"id": "123", "title": "فيلا فاخرة", "location": "الرياض"}
    }
    
    Returns: Video file (video/mp4)
    """
    try:
        data = request.json
        
        if not data or not data.get('images'):
            return jsonify({"error": "No images provided"}), 400
        
        local_images = []
        for img in data.get('images', []):
            local_path = download_image(img)
            if local_path:
                local_images.append(local_path)
        
        if not local_images:
            return jsonify({"error": "Failed to download any images"}), 400
        
        output_path = generate_property_video(
            images=local_images,
            tier=data.get('tier', 'tier1_safwa'),
            ambience=data.get('ambience', 'none'),
            property_data=data.get('property', {}),
            script=data.get('script'),
            voice=data.get('voice', 'onyx')
        )
        
        for img in local_images:
            if img.startswith(tempfile.gettempdir()):
                try:
                    os.remove(img)
                except:
                    pass
        
        return send_file(
            output_path, 
            mimetype='video/mp4',
            as_attachment=True,
            download_name=f"property_video_{data.get('property', {}).get('id', 'temp')}.mp4"
        )
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
