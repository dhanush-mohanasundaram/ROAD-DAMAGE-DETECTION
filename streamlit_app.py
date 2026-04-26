"""
RoadSense AI - Streamlit Deployment
====================================
Real-time road damage detection using YOLOv8
"""

import streamlit as st
import cv2
import numpy as np
from ultralytics import YOLO
from PIL import Image
import tempfile
import os
import time
from datetime import datetime

# Page configuration
st.set_page_config(
    page_title="RoadSense AI - Road Damage Detection",
    page_icon="🛣️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        text-align: center;
        color: #1f77b4;
        font-size: 2.5em;
        margin-bottom: 1em;
    }
    .detection-card {
        background-color: #f0f2f6;
        padding: 20px;
        border-radius: 10px;
        margin: 10px 0;
        border-left: 5px solid #1f77b4;
    }
    .severity-high {
        border-left-color: #dc3545;
        background-color: #f8d7da;
    }
    .severity-medium {
        border-left-color: #ffc107;
        background-color: #fff3cd;
    }
    .severity-low {
        border-left-color: #28a745;
        background-color: #d4edda;
    }
    .metric-card {
        background-color: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        text-align: center;
    }
</style>
""", unsafe_allow_html=True)

# Initialize session state
if 'model' not in st.session_state:
    st.session_state.model = None
if 'detections' not in st.session_state:
    st.session_state.detections = []

@st.cache_resource
def load_model():
    """Load YOLO model with caching"""
    try:
        # Try to load best.pt first, fallback to yolov8n.pt
        model_path = "best.pt"
        if not os.path.exists(model_path):
            model_path = "yolov8n.pt"

        model = YOLO(model_path)
        return model
    except Exception as e:
        st.error(f"Error loading model: {e}")
        return None

def detect_damage(image, confidence_threshold=0.45):
    """Run YOLO detection on image"""
    if st.session_state.model is None:
        st.session_state.model = load_model()

    if st.session_state.model is None:
        return [], image

    # Convert PIL to numpy array if needed
    if isinstance(image, Image.Image):
        image = np.array(image)

    # Run inference
    results = st.session_state.model(image, conf=confidence_threshold, verbose=False)

    detections = []
    annotated_image = image.copy()

    for result in results:
        if result.boxes is not None:
            for box in result.boxes:
                # Get detection details
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                class_name = st.session_state.model.names.get(cls_id, f"class_{cls_id}")

                # Get bounding box coordinates
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()

                # Determine severity based on confidence and class
                if conf > 0.8:
                    severity = "High"
                    color = (0, 0, 255)  # Red
                elif conf > 0.6:
                    severity = "Medium"
                    color = (0, 165, 255)  # Orange
                else:
                    severity = "Low"
                    color = (0, 255, 0)  # Green

                # Draw bounding box
                cv2.rectangle(annotated_image, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)

                # Add label
                label = f"{class_name}: {conf:.2f} ({severity})"
                cv2.putText(annotated_image, label, (int(x1), int(y1)-10),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

                detections.append({
                    'class': class_name,
                    'confidence': conf,
                    'severity': severity,
                    'bbox': [int(x1), int(y1), int(x2), int(y2)],
                    'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })

    return detections, annotated_image

def main():
    # Header
    st.markdown('<h1 class="main-header">🛣️ RoadSense AI</h1>', unsafe_allow_html=True)
    st.markdown('<p style="text-align: center; font-size: 1.2em; color: #666;">Real-time Road Damage Detection using YOLOv8</p>', unsafe_allow_html=True)

    # Sidebar
    with st.sidebar:
        st.header("⚙️ Settings")

        confidence = st.slider("Confidence Threshold", 0.1, 1.0, 0.45, 0.05)
        st.info("Higher values = fewer but more confident detections")

        st.header("📊 Statistics")
        if st.session_state.detections:
            total_detections = len(st.session_state.detections)
            high_severity = len([d for d in st.session_state.detections if d['severity'] == 'High'])
            medium_severity = len([d for d in st.session_state.detections if d['severity'] == 'Medium'])
            low_severity = len([d for d in st.session_state.detections if d['severity'] == 'Low'])

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Total", total_detections)
            with col2:
                st.metric("High", high_severity, delta=high_severity)
            with col3:
                st.metric("Medium", medium_severity)
            with col4:
                st.metric("Low", low_severity)

        if st.button("🗑️ Clear Results"):
            st.session_state.detections = []
            st.rerun()

    # Main content
    col1, col2 = st.columns([1, 1])

    with col1:
        st.header("📤 Input")

        # File uploader
        uploaded_file = st.file_uploader("Choose an image...", type=['jpg', 'jpeg', 'png'])

        # Camera input
        camera_input = st.camera_input("Or take a photo")

        # Process the input
        input_image = None
        if uploaded_file is not None:
            input_image = Image.open(uploaded_file)
        elif camera_input is not None:
            input_image = Image.open(camera_input)

        if input_image is not None:
            st.image(input_image, caption="Input Image", use_column_width=True)

            if st.button("🔍 Detect Damage", type="primary"):
                with st.spinner("Analyzing image..."):
                    detections, annotated_image = detect_damage(input_image, confidence)

                    # Add to session state
                    st.session_state.detections.extend(detections)

                    # Display results
                    with col2:
                        st.header("📊 Results")

                        if detections:
                            st.success(f"Found {len(detections)} damage detection(s)")

                            # Show annotated image
                            st.image(annotated_image, caption="Detection Results", use_column_width=True)

                            # Show detection details
                            for i, det in enumerate(detections):
                                severity_class = f"severity-{det['severity'].lower()}"
                                st.markdown(f"""
                                <div class="detection-card {severity_class}">
                                    <h4>🚨 Detection #{i+1}</h4>
                                    <p><strong>Class:</strong> {det['class']}</p>
                                    <p><strong>Confidence:</strong> {det['confidence']:.2%}</p>
                                    <p><strong>Severity:</strong> {det['severity']}</p>
                                    <p><strong>Time:</strong> {det['timestamp']}</p>
                                </div>
                                """, unsafe_allow_html=True)
                        else:
                            st.info("No damage detected in this image.")
                            st.image(input_image, caption="Original Image", use_column_width=True)

    # Recent detections section
    if st.session_state.detections:
        st.header("📈 Recent Detections")

        # Group by severity
        severity_counts = {}
        for det in st.session_state.detections[-10:]:  # Show last 10
            severity = det['severity']
            if severity not in severity_counts:
                severity_counts[severity] = 0
            severity_counts[severity] += 1

        cols = st.columns(len(severity_counts))
        for i, (severity, count) in enumerate(severity_counts.items()):
            with cols[i]:
                st.markdown(f"""
                <div class="metric-card">
                    <h3>{count}</h3>
                    <p>{severity} Severity</p>
                </div>
                """, unsafe_allow_html=True)

        # Show recent detections table
        st.subheader("Latest Detections")
        recent_df = st.session_state.detections[-5:]  # Show last 5
        if recent_df:
            st.table([{
                'Time': d['timestamp'],
                'Class': d['class'],
                'Confidence': f"{d['confidence']:.2%}",
                'Severity': d['severity']
            } for d in recent_df])

    # Footer
    st.markdown("---")
    st.markdown("""
    <div style="text-align: center; color: #666;">
        <p>Built with ❤️ using YOLOv8 and Streamlit</p>
        <p>RoadSense AI - Making roads safer through AI-powered damage detection</p>
    </div>
    """, unsafe_allow_html=True)

if __name__ == "__main__":
    main()
