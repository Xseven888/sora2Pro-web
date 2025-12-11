/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React from 'react';
import './WebsiteGuide.css';

const WebsiteGuide: React.FC = () => {
  return (
    <div className="website-guide-container">
      <div className="video-wrapper">
        <iframe
          src="https://player.bilibili.com/player.html?isOutside=true&aid=115701939442017&bvid=BV1zSmgB1E2j&cid=34673853893&p=1"
          scrolling="no"
          frameBorder="0"
          allowFullScreen
          className="bilibili-iframe"
          title="网站功能说明"
        />
      </div>
    </div>
  );
};

export default WebsiteGuide;

