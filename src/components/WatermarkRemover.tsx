/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React from 'react';
import './WatermarkRemover.css';

const WatermarkRemover: React.FC = () => {
  return (
    <div className="watermark-remover-container">
      <iframe
        src="https://sora2.email/"
        title="Sora免费去水印"
        className="watermark-iframe"
        frameBorder="0"
        allowFullScreen
      />
    </div>
  );
};

export default WatermarkRemover;

