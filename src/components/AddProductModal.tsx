/**
 * 作者：沐七
 * 日期：2025/12/11
 */
import React, { useState, useRef } from 'react';
import './Modal.css';

interface AddProductModalProps {
  onAdd: (product: { title: string; mainImage: string }) => void;
  onClose: () => void;
}

const AddProductModal: React.FC<AddProductModalProps> = ({ onAdd, onClose }) => {
  const [title, setTitle] = useState('');
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (file: File) => {
    setMainImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setImagePreview(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert('请输入商品标题');
      return;
    }

    if (!mainImage) {
      alert('请上传主图');
      return;
    }

    // 上传图片到图床
    try {
      const formData = new FormData();
      formData.append('file', mainImage);
      
      const response = await fetch('https://imageproxy.zhongzhuan.chat/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('图片上传失败');
      }

      const result = await response.json();
      onAdd({
        title,
        mainImage: result.url,
      });
    } catch (error: any) {
      alert(`上传失败: ${error.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>添加商品</h3>
          <div className="modal-header-actions">
            <button className="modal-help">?</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          <h2>添加商品</h2>

          <div className="form-group">
            <label>商品标题</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入商品标题 (支持多行)"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>主图 (拖拽图片到此区域)</label>
            <p className="form-hint">
              点击下方按钮选择图片,或直接拖拽图片到这里
            </p>
            <div
              className="image-upload-area-modal"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="预览" className="image-preview-modal" />
              ) : (
                <p>拖拽图片到此处或点击下方按钮选择</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImageSelect(file);
                }
              }}
              style={{ display: 'none' }}
            />
            <button
              className="select-image-button"
              onClick={() => fileInputRef.current?.click()}
            >
              选择图片
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>取消</button>
          <button className="confirm-button" onClick={handleSubmit}>确定</button>
        </div>
      </div>
    </div>
  );
};

export default AddProductModal;


