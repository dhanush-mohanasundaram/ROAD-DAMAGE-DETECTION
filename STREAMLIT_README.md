# RoadSense AI - Road Damage Detection

🛣️ **Real-time road damage detection using YOLOv8 and computer vision**

## 🚀 Streamlit Deployment

This project can be deployed on Streamlit Cloud for easy web access.

### Prerequisites

- A GitHub repository with this code
- Streamlit account (free at [share.streamlit.io](https://share.streamlit.io))

### Quick Deploy

1. **Fork or clone this repository to your GitHub**

2. **Go to [share.streamlit.io](https://share.streamlit.io)**

3. **Connect your GitHub account**

4. **Select this repository**

5. **Set the main file path to:** `streamlit_app.py`

6. **Add secrets (optional):**
   ```
   No secrets required for basic functionality
   ```

7. **Click "Deploy!"**

### Local Development

```bash
# Install dependencies
pip install -r requirements_streamlit.txt

# Run the app locally
streamlit run streamlit_app.py
```

### Features

- 📤 **Image Upload**: Upload road images for damage detection
- 📷 **Camera Input**: Take photos directly from your device
- 🔍 **Real-time Detection**: Powered by YOLOv8 model
- 📊 **Severity Classification**: High, Medium, Low severity levels
- 📈 **Statistics Dashboard**: Track detection metrics
- 🎨 **Beautiful UI**: Modern, responsive design

### Model Information

- **Primary Model**: `best.pt` (custom trained YOLOv8)
- **Fallback Model**: `yolov8n.pt` (pre-trained YOLOv8 nano)
- **Classes**: Potholes and road damage detection
- **Confidence Threshold**: Adjustable (default: 45%)

### Project Structure

```
├── streamlit_app.py          # Main Streamlit application
├── best.pt                   # Custom trained YOLOv8 model
├── yolov8n.pt               # Fallback YOLOv8 nano model
├── requirements_streamlit.txt # Streamlit dependencies
├── detect.py                # Original camera detection script
├── app.py                   # Original Flask web app
├── static/                  # Web assets (Flask version)
├── templates/               # HTML templates (Flask version)
└── dataset/                 # Training data and labels
```

### Usage

1. **Upload an Image**: Click "Browse files" to select a road image
2. **Or Use Camera**: Click "Take Photo" to capture directly
3. **Adjust Settings**: Modify confidence threshold in sidebar
4. **View Results**: See detections with bounding boxes and severity levels
5. **Track Statistics**: Monitor detection counts in the sidebar

### Performance Tips

- Use images with good lighting for best results
- Higher confidence thresholds reduce false positives
- The model works best on clear road surface images
- Processing time depends on image size and complexity

### Troubleshooting

**Model Loading Issues:**
- Ensure `best.pt` or `yolov8n.pt` is in the project root
- Check file permissions and integrity

**Streamlit Deployment Issues:**
- Verify all files are committed to GitHub
- Check that `streamlit_app.py` is in the root directory
- Ensure `requirements_streamlit.txt` contains all dependencies

**Performance Issues:**
- Reduce image size for faster processing
- Increase confidence threshold to reduce detections
- Use GPU-enabled Streamlit if available

### Contributing

Feel free to submit issues and enhancement requests!

### License

This project is open source. Please check individual component licenses.

---

**Built with ❤️ for safer roads through AI**</content>
<parameter name="filePath">e:\NIRAL_HACKETHON\Road-Damage-Detection--main\STREAMLIT_README.md