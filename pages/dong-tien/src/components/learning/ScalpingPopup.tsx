interface ScalpingPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const BENEFITS = [
  'Tài liệu học trực tuyến trên hệ thống, học mọi lúc mọi nơi.',
  'Giao dịch theo quy trình 4 bước, không theo cảm tính.',
  'Group thảo luận và phân tích thị trường quốc tế.',
  'Đồng hành 8 tuần xây dựng kỷ luật giao dịch.',
  'Zoom thực hành trên thị trường thực tế.',
  'Hỗ trợ 1-1 dành cho người mới.',
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="scalping-check-icon" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59z"
      />
    </svg>
  );
}

export default function ScalpingPopup({ isOpen, onClose }: ScalpingPopupProps) {
  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="scalping-inline-wrapper">
      <style>{`

        .scalping-inline-wrapper {
          width: 100%;
          position: relative;
        }

        .scalping-card {
          position: relative;
          background: #000000;
          width: 100%;
          display: flex;
          flex-direction: row;
          align-items: start;
          gap: 48px;
          padding: 56px 48px;
          overflow: hidden;
        }

        /* ---- Left column ---- */

        .scalping-col-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          gap: 60px;
        }

        .scalping-title {
          margin: -5px 0 0 0;
          font-family: 'Paytone One', sans-serif;
          font-weight: 400;
          font-size: clamp(30px, 3vw, 56px);
          line-height: 1.5;
          text-align: center;
          background: linear-gradient(180deg, #E6FF27 0%, #FF9225 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-transform: uppercase;
        }

        .scalping-subtitle {
          margin: 0;
          font-family: 'Paytone One', sans-serif;
          font-weight: 400;
          font-size: clamp(22px, 2.5vw, 42px);
          line-height: 1.2;
          text-align: center;
          color: #ffffff;
          text-transform: uppercase;
        }

        .scalping-benefits-title {
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: clamp(18px, 1.6vw, 26px);
          line-height: 1.25;
          color: #ffffff;
          margin: 0 0 10px 0;
        }

        .scalping-benefit-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
          width: 100%;
        }

        .scalping-benefit-item {
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 18px;
        }

        .scalping-check-icon {
          flex: none;
          width: 26px;
          height: 26px;
          margin-top: 2px;
          color: #ffffff;
        }

        .scalping-benefit-text {
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          font-size: clamp(14px, 2vw, 22px);
          line-height: 1.4;
          color: #ffffff;
          text-align: left;
        }

        /* ---- Right column ---- */

        .scalping-col-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }

        .scalping-discount {
          margin: 0;
          font-family: 'Paytone One', sans-serif;
          font-weight: 400;
          font-size: clamp(28px, 3.2vw, 48px);
          line-height: 1.2;
          text-align: center;
          color: #ffffff;
          text-transform: uppercase;
        }

        .scalping-price-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .scalping-price-new {
          font-family: 'Oswald', sans-serif;
          font-weight: 700;
          font-size: clamp(36px, 4.4vw, 64px);
          line-height: 1;
          text-align: center;
          background: linear-gradient(180deg, #E6FF27 0%, #FF9225 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .scalping-price-old {
          font-family: 'Oswald', sans-serif;
          font-weight: 700;
          font-size: clamp(18px, 2vw, 28px);
          line-height: 1.15;
          text-align: center;
          text-decoration-line: line-through;
          color: #828282;
        }

        .scalping-qr-block {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
          background: #ffffff;
          border-radius: 24px;
          padding: 12px;
          width: 380px;
        }

        .scalping-qr-box {
          width: 100%;
          aspect-ratio: 1 / 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .scalping-card {
            flex-direction: column;
            padding: 32px 20px;
            gap: 32px;
          }

          .scalping-col-left,
          .scalping-col-right {
            flex: none;
            width: 100%;
          }

          .scalping-title,
          .scalping-subtitle,
          .scalping-discount,
          .scalping-price-new,
          .scalping-price-old {
            text-align: center;
          }

          .scalping-col-left {
            align-items: center;
            text-align: center;
          }

          .scalping-benefit-item {
            align-items: center;
          }

          .scalping-benefit-item {
            gap: 10px;
          }

          .scalping-qr-block {
            width: 280px;
          }
        }
      `}</style>

      <div className="scalping-card">
        {/* Left column: course info */}
        <div className="scalping-col-left">
          <div style={{display:'flex', flexDirection:'column', gap:'32px'}}>
            <p className="scalping-title">Học Nghề Trading</p>
            <p className="scalping-subtitle">Ưu Đãi Giới Hạn</p>
          </div>


          <div className="scalping-benefit-list">
          <div className="scalping-benefits-title">Các quyền lợi bạn sẽ nhận được</div>
            {BENEFITS.map((text, idx) => (
              <li className="scalping-benefit-item" key={idx}>
                <CheckIcon />
                <span className="scalping-benefit-text">{text}</span>
              </li>
            ))}
          </div>
        </div>

        {/* Right column: offer + QR */}
        <div className="scalping-col-right">
          <div className="scalping-discount">Giảm 72%</div>

          <div className="scalping-price-block">
            <div className="scalping-price-new">555.555đ</div>
            <div className="scalping-price-old">2.000.000đ</div>
          </div>

          <div className="scalping-qr-block">
            <div className="scalping-qr-box">
              <img
                src="/dong-tien/images/image_academic_survey/qr-stk-vinmoc.png"
                alt="QR Code"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
