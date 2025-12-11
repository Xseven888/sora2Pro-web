/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState } from 'react';
import { PromptSettings } from '../types';
import './Modal.css';

interface PromptSettingsModalProps {
  settings: PromptSettings;
  onSave: (settings: PromptSettings) => void;
  onClose: () => void;
}

const PromptSettingsModal: React.FC<PromptSettingsModalProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [mainImagePrompt, setMainImagePrompt] = useState(settings.mainImagePrompt);
  const [scenePrompt, setScenePrompt] = useState(settings.scenePrompt);

  const handleSave = () => {
    onSave({
      mainImagePrompt,
      scenePrompt,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>提示词设置</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="prompt-section">
            <h4>主图处理提示词</h4>
            <textarea
              value={mainImagePrompt}
              onChange={(e) => setMainImagePrompt(e.target.value)}
              rows={8}
              placeholder="主图处理提示词..."
            />
          </div>

          <div className="prompt-section">
            <h4>场景生成提示词</h4>
            <textarea
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              rows={8}
              placeholder="场景生成提示词..."
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>取消</button>
          <button className="confirm-button" onClick={handleSave}>确定</button>
        </div>
      </div>
    </div>
  );
};

export default PromptSettingsModal;

