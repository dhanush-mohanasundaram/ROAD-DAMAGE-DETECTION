"""
RoadSense AI — Mobile Detection App
====================================
Streamlit web app for real-time road damage detection.
Works on phone browsers and laptops.
Deploy to Streamlit Cloud for free mobile access.

Run locally:  streamlit run app.py
Deploy:       Push to GitHub → connect Streamlit Cloud
"""

import io
import os
import sys
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
import streamlit as st
from PIL import Image

# ── Page config (MUST be first Streamlit command) ──
st.set_page_config(
    page_title="RoadSense AI",
    page_icon="🛣️",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={
        'About': 'RoadSense AI — NIRAL Thiruvizha 3.0'
    }
)

# ── Add project root to path ───────────────────────
PROJECT_ROOT = os.path.dirname(__file__)
sys.path.insert(0, PROJECT_ROOT)

import detect
from detect import BASE_LAT, BASE_LON, classify_severity, find_best_model, push_to_firebase

MODEL_PATH = find_best_model()

if 'detections' not in st.session_state:
    st.session_state.detections = []
if 'model' not in st.session_state:
    st.session_state.model = None
if 'model_status' not in st.session_state:
    st.session_state.model_status = "Not loaded"
if 'firebase_ok' not in st.session_state:
    st.session_state.firebase_ok = False


@st.cache_resource
def load_model():
    try:
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)
        return model, f"Loaded {MODEL_PATH}"
    except Exception as exc:
        return None, str(exc)


def initialize_firebase() -> bool:
    try:
        detect.init_firebase()
        return getattr(detect, '_firebase_ok', False)
    except Exception:
        return False


def bytes_to_bgr(image_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    return image_bgr


def bgr_to_rgb(image_bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)


def draw_boxes(image_bgr: np.ndarray, detections: list) -> np.ndarray:
    image = image_bgr.copy()
    color_map = {
        'High': (239, 68, 68),
        'Medium': (245, 158, 11),
        'Low': (16, 185, 129)
    }
    for det in detections:
        x1, y1, x2, y2 = det['box']
        color = color_map.get(det['severity'], (148, 163, 184))
        cv2.rectangle(image, (x1, y1), (x2, y2), color, 3)
        label = f"{det['label']} {det['confidence']:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(image, (x1, y1 - th - 12), (x1 + tw + 8, y1), color, -1)
        cv2.putText(image, label, (x1 + 4, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return image


def run_detection(image_bgr: np.ndarray, model, threshold: float):
    if model is None:
        return []
    try:
        image_rgb = bgr_to_rgb(image_bgr)
        results = model(image_rgb, conf=threshold, verbose=False)
        detections = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                conf = float(box.conf[0])
                if conf < threshold:
                    continue
                cls_id = int(box.cls[0])
                label = model.names.get(cls_id, f'class_{cls_id}')
                x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                severity = classify_severity(conf)
                detections.append({
                    'label': label,
                    'confidence': conf,
                    'severity': severity,
                    'box': (x1, y1, x2, y2),
                    'latitude': round(BASE_LAT + np.random.uniform(-0.003, 0.003), 6),
                    'longitude': round(BASE_LON + np.random.uniform(-0.003, 0.003), 6),
                    'timestamp': datetime.now().isoformat()
                })
        return detections
    except Exception as exc:
        st.error(f"Detection failed: {exc}")
        return []


def generate_qr_code(url: str) -> Optional[bytes]:
    try:
        import qrcode
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=8,
            border=2
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color='black', back_color='white')
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()
    except Exception:
        return None


def get_css() -> str:
    return """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    html, body, [class*="css"] { font-family: 'Inter', sans-serif; }
    #MainMenu {visibility: hidden;} footer {visibility: hidden;}
    .main-header {background: linear-gradient(135deg, #0F172A 0%, #4F46E5 100%); color: white; padding: 24px 24px; border-radius: 18px; margin-bottom: 20px;}
    .main-header h1 {margin: 0; font-size: 28px;}
    .main-header p {margin: 6px 0 0 0; color: #CBD5E1;}
    .kpi-card {background: white; border: 1px solid #E2E8F0; border-radius: 18px; padding: 18px; margin-bottom: 14px;}
    .kpi-number {font-size: 32px; font-weight: 700; margin: 0;}
    .kpi-label {margin: 4px 0 0 0; color: #64748B; font-size: 12px;}
    .detection-card {background: white; border: 1px solid #E2E8F0; border-radius: 16px; padding: 16px; margin-bottom: 14px;}
    .badge-high {background: #FEE2E2; color: #991B1B; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;}
    .badge-medium {background: #FEF3C7; color: #92400E; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;}
    .badge-low {background: #DCFCE7; color: #065F46; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;}
    .alert-box {border-radius: 14px; padding: 16px; margin-bottom: 16px;}
    .alert-box.info {background: #EFF6FF; border: 1px solid #BFDBFE; color: #1D4ED8;}
    .alert-box.warn {background: #FFFBEB; border: 1px solid #FDE68A; color: #92400E;}
    .alert-box.error {background: #FEE2E2; border: 1px solid #FCA5A5; color: #991B1B;}
    </style>
    """


def render_card(det: dict) -> str:
    return f"""
    <div class='detection-card'>
      <div style='display:flex;justify-content:space-between;align-items:center;'>
        <div><strong>{det['label'].upper()}</strong></div>
        <div class='badge-{det['severity'].lower()}'>{det['severity']}</div>
      </div>
      <div style='margin-top:10px;color:#475569;font-size:13px;'>
        Confidence: <strong>{det['confidence']:.1%}</strong><br>
        GPS: {det['latitude']:.4f}, {det['longitude']:.4f}<br>
        Time: {det['timestamp'][11:19]}
      </div>
    </div>
    """


def main():
    st.markdown(get_css(), unsafe_allow_html=True)

    if st.session_state.model is None:
        st.session_state.model, st.session_state.model_status = load_model()

    st.session_state.firebase_ok = initialize_firebase()

    with st.sidebar:
        st.markdown("""
        <div style='padding:14px 0 8px 0;'>
            <div style='font-size:22px;font-weight:700;color:#0F172A;'>🛣️ RoadSense AI</div>
            <div style='font-size:12px;color:#64748B;margin-top:4px;'>Mobile-friendly NIRAL demo app</div>
        </div>
        """, unsafe_allow_html=True)

        page = st.radio("Navigation", [
            "🏠 Home",
            "📷 Upload Image",
            "📱 Phone Camera",
            "🗺️ Live Map",
            "📊 Analytics",
            "📋 History",
            "ℹ️ About"
        ])

        st.markdown("---")
        st.markdown(f"**Model:** {st.session_state.model_status}")
        st.markdown(f"**Firebase:** {'Online' if st.session_state.firebase_ok else 'Offline'}")

        threshold = st.slider("Confidence threshold", 0.25, 0.95, 0.45, 0.05)
        show_boxes = st.checkbox("Show bounding boxes", value=True)
        save_to_firebase = st.checkbox("Save to Firebase", value=st.session_state.firebase_ok, disabled=not st.session_state.firebase_ok)

    if page == "🏠 Home":
        st.markdown("""
        <div class='main-header'>
            <h1>🛣️ RoadSense AI</h1>
            <p>Mobile-ready road damage detection for demo day.</p>
        </div>
        """, unsafe_allow_html=True)
        total = len(st.session_state.detections)
        high = sum(1 for d in st.session_state.detections if d['severity'] == 'High')
        medium = sum(1 for d in st.session_state.detections if d['severity'] == 'Medium')
        low = sum(1 for d in st.session_state.detections if d['severity'] == 'Low')
        c1, c2, c3, c4 = st.columns(4)
        c1.markdown(f"<div class='kpi-card'><p class='kpi-number'>{total}</p><p class='kpi-label'>Total</p></div>", unsafe_allow_html=True)
        c2.markdown(f"<div class='kpi-card'><p class='kpi-number'>{high}</p><p class='kpi-label'>High</p></div>", unsafe_allow_html=True)
        c3.markdown(f"<div class='kpi-card'><p class='kpi-number'>{medium}</p><p class='kpi-label'>Medium</p></div>", unsafe_allow_html=True)
        c4.markdown(f"<div class='kpi-card'><p class='kpi-number'>{low}</p><p class='kpi-label'>Low</p></div>", unsafe_allow_html=True)
        st.markdown("---")
        st.markdown("**Use the side menu to upload an image or use your phone camera.**")

    elif page == "📷 Upload Image":
        st.markdown("""
        <div class='main-header'>
            <h1>📷 Upload Image</h1>
            <p>Select a road photo from your phone or laptop.</p>
        </div>
        """, unsafe_allow_html=True)
        uploaded = st.file_uploader("Choose image", type=['jpg', 'jpeg', 'png', 'webp'])
        if uploaded is not None:
            image_bgr = bytes_to_bgr(uploaded.read())
            st.image(bgr_to_rgb(image_bgr), use_column_width=True)
            if st.button("Detect Damage"):
                with st.spinner("Running YOLO detection..."):
                    detections = run_detection(image_bgr, st.session_state.model, threshold)
                if detections:
                    if show_boxes:
                        st.image(bgr_to_rgb(draw_boxes(image_bgr, detections)), use_column_width=True)
                    for det in detections:
                        st.markdown(render_card(det), unsafe_allow_html=True)
                        st.session_state.detections.append(det)
                        if save_to_firebase:
                            push_to_firebase({
                                'type': det['label'],
                                'confidence': det['confidence'],
                                'severity': det['severity'],
                                'latitude': det['latitude'],
                                'longitude': det['longitude'],
                                'timestamp': det['timestamp']
                            })
                else:
                    st.warning("No detections found. Try another photo.")

    elif page == "📱 Phone Camera":
        st.markdown("""
        <div class='main-header'>
            <h1>📱 Phone Camera</h1>
            <p>Use your phone camera to capture road damage live.</p>
        </div>
        """, unsafe_allow_html=True)
        camera_image = st.camera_input("Capture road damage")
        if camera_image is not None:
            image_bgr = bytes_to_bgr(camera_image.read())
            st.image(bgr_to_rgb(image_bgr), use_column_width=True)
            if st.button("Analyze Capture"):
                with st.spinner("Analyzing capture..."):
                    detections = run_detection(image_bgr, st.session_state.model, threshold)
                if detections:
                    if show_boxes:
                        st.image(bgr_to_rgb(draw_boxes(image_bgr, detections)), use_column_width=True)
                    for det in detections:
                        st.markdown(render_card(det), unsafe_allow_html=True)
                        st.session_state.detections.append(det)
                        if save_to_firebase:
                            push_to_firebase({
                                'type': det['label'],
                                'confidence': det['confidence'],
                                'severity': det['severity'],
                                'latitude': det['latitude'],
                                'longitude': det['longitude'],
                                'timestamp': det['timestamp']
                            })
                else:
                    st.success("No damage detected in this capture.")

    elif page == "🗺️ Live Map":
        st.markdown("""
        <div class='main-header'>
            <h1>🗺️ Live Map</h1>
            <p>View detection locations on a map.</p>
        </div>
        """, unsafe_allow_html=True)
        try:
            import folium
            from streamlit_folium import st_folium
            m = folium.Map(location=[BASE_LAT, BASE_LON], zoom_start=13, tiles='OpenStreetMap')
            if st.session_state.detections:
                for det in st.session_state.detections:
                    folium.CircleMarker(
                        location=[det['latitude'], det['longitude']],
                        radius=8,
                        color='#EF4444' if det['severity'] == 'High' else '#F59E0B' if det['severity'] == 'Medium' else '#10B981',
                        fill=True,
                        fill_color='#EF4444' if det['severity'] == 'High' else '#F59E0B' if det['severity'] == 'Medium' else '#10B981',
                        popup=f"{det['label']} ({det['severity']})\nConfidence: {det['confidence']:.1%}",
                    ).add_to(m)
            else:
                folium.Marker([BASE_LAT, BASE_LON], popup='Base location').add_to(m)
            st_folium(m, width=700, height=500)
        except Exception:
            st.error("Install folium and streamlit-folium in Streamlit requirements.")

    elif page == "📊 Analytics":
        st.markdown("""
        <div class='main-header'>
            <h1>📊 Analytics</h1>
            <p>Explore severity and confidence trends.</p>
        </div>
        """, unsafe_allow_html=True)
        if not st.session_state.detections:
            st.info("No detections yet. Run a detection first.")
        else:
            import pandas as pd
            import plotly.express as px
            df = pd.DataFrame(st.session_state.detections)
            col1, col2 = st.columns(2)
            with col1:
                fig = px.pie(df, names='severity', hole=0.4, title='Severity distribution', color='severity', color_discrete_map={'High': '#EF4444', 'Medium': '#F59E0B', 'Low': '#10B981'})
                st.plotly_chart(fig, use_container_width=True)
            with col2:
                fig2 = px.bar(df['label'].value_counts().reset_index(), x='index', y='label', title='Damage type count', labels={'index': 'Type', 'label': 'Count'})
                st.plotly_chart(fig2, use_container_width=True)

    elif page == "📋 History":
        st.markdown("""
        <div class='main-header'>
            <h1>📋 History</h1>
            <p>Session detection history.</p>
        </div>
        """, unsafe_allow_html=True)
        if not st.session_state.detections:
            st.info("No history available yet.")
        else:
            import pandas as pd
            df = pd.DataFrame(st.session_state.detections)
            st.dataframe(df[['label', 'severity', 'confidence', 'latitude', 'longitude', 'timestamp']].rename(columns={'label': 'Type', 'confidence': 'Confidence', 'latitude': 'Latitude', 'longitude': 'Longitude', 'timestamp': 'Timestamp'}), use_container_width=True)
            csv = df.to_csv(index=False).encode('utf-8')
            st.download_button("Download CSV", csv, "detection_history.csv", "text/csv")
            if st.button("Clear history"):
                st.session_state.detections = []
                st.experimental_rerun()

    else:
        st.markdown("""
        <div class='main-header'>
            <h1>ℹ️ About</h1>
            <p>RoadSense AI mobile Streamlit demo.</p>
        </div>
        """, unsafe_allow_html=True)
        st.markdown("""
        - Mobile-friendly road damage detection
        - Uses YOLOv8 with fallback to yolov8n.pt
        - Offline mode if Firebase key is missing
        - Phone camera and image upload support
        """)
        app_url = st.text_input("Your deployed Streamlit app URL", "https://your-app.streamlit.app")
        if app_url:
            qr = generate_qr_code(app_url)
            if qr:
                st.image(qr, width=260)
                st.download_button("Download QR code", qr, "roadsense_qr.png", "image/png")


if __name__ == '__main__':
    main()
