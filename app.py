"""
RoadSense AI — Mobile Detection App
====================================
Streamlit web app for real-time road damage detection.
Works on phone browsers and laptops.
Deploy to Streamlit Cloud for free mobile access.

Run locally:  streamlit run app.py
Deploy:       Push to GitHub → connect Streamlit Cloud
"""

import glob
import io
import os
import random
import sys
from datetime import datetime
from typing import Optional

import numpy as np
import streamlit as st
from PIL import Image, ImageDraw, ImageFont

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

MODEL_PATH = None
BASE_LAT = 12.9716
BASE_LON = 77.5946

if 'detections' not in st.session_state:
    st.session_state.detections = []
if 'model' not in st.session_state:
    st.session_state.model = None
if 'model_status' not in st.session_state:
    st.session_state.model_status = "Not loaded"
if 'firebase_ok' not in st.session_state:
    st.session_state.firebase_ok = False


def find_best_model() -> str:
    candidates = [
        "best.pt",
        os.path.join("weights", "best.pt"),
        os.path.join("models", "best.pt")
    ]
    runs = glob.glob(os.path.join("runs", "detect", "*", "weights", "best.pt"))
    if runs:
        candidates.append(max(runs, key=os.path.getmtime))
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return "yolov8n.pt"


def classify_severity(confidence: float, sensors=None) -> str:
    if sensors:
        z_spike = sensors.get("z_spike", 0.0)
        if confidence >= 0.80 or z_spike > 2.0:
            return "High"
        if confidence >= 0.60:
            return "Medium"
        return "Low"
    if confidence >= 0.80:
        return "High"
    if confidence >= 0.60:
        return "Medium"
    return "Low"


@st.cache_resource
def load_model():
    global MODEL_PATH
    if MODEL_PATH is None:
        MODEL_PATH = find_best_model()
    try:
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)
        return model, f"Loaded {MODEL_PATH}"
    except Exception as exc:
        return None, str(exc)


def initialize_firebase() -> bool:
    key_path = "firebase_key.json"
    if not os.path.exists(key_path):
        return False
    try:
        import firebase_admin
        from firebase_admin import credentials, db
        if not firebase_admin._apps:
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred, {
                'databaseURL': os.environ.get(
                    'FIREBASE_URL',
                    'https://road-5ae51-default-rtdb.firebaseio.com'
                )
            })
        return True
    except Exception:
        return False


def push_to_firebase(record: dict) -> bool:
    try:
        import firebase_admin
        from firebase_admin import db
        db.reference('detections').push(record)
        return True
    except Exception:
        return False


def bytes_to_pil(image_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def pil_to_np(image: Image.Image) -> np.ndarray:
    return np.array(image)


def draw_boxes(image: Image.Image, detections: list) -> Image.Image:
    image = image.copy()
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    color_map = {
        'High': '#EF4444',
        'Medium': '#F59E0B',
        'Low': '#10B981'
    }
    for det in detections:
        x1, y1, x2, y2 = det['box']
        color = color_map.get(det['severity'], '#94A3B8')
        draw.rectangle([x1, y1, x2, y2], outline=color, width=4)
        label = f"{det['label']} {det['confidence']:.0%}"
        text_size = draw.textsize(label, font=font)
        text_bg = [x1, max(y1 - text_size[1] - 8, 0), x1 + text_size[0] + 10, y1]
        draw.rectangle(text_bg, fill=color)
        draw.text((x1 + 5, max(y1 - text_size[1] - 5, 0)), label, fill='white', font=font)
    return image


def run_detection(image: Image.Image, model, threshold: float):
    if model is None:
        return []
    try:
        results = model(image, conf=threshold, verbose=False)
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
                    'latitude': round(BASE_LAT + random.uniform(-0.003, 0.003), 6),
                    'longitude': round(BASE_LON + random.uniform(-0.003, 0.003), 6),
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
            image = bytes_to_pil(uploaded.read())
            st.image(image, use_column_width=True)
            if st.button("Detect Damage"):
                with st.spinner("Running YOLO detection..."):
                    detections = run_detection(image, st.session_state.model, threshold)
                if detections:
                    if show_boxes:
                        st.image(draw_boxes(image, detections), use_column_width=True)
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
            image = bytes_to_pil(camera_image.read())
            st.image(image, use_column_width=True)
            if st.button("Analyze Capture"):
                with st.spinner("Analyzing capture..."):
                    detections = run_detection(image, st.session_state.model, threshold)
                if detections:
                    if show_boxes:
                        st.image(draw_boxes(image, detections), use_column_width=True)
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
