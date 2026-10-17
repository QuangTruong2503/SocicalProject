import { useCallback, useId } from 'react';
import { useDropzone } from 'react-dropzone';
import { FiUploadCloud } from 'react-icons/fi';
import { describeRejections, formatBytes, rejectEmptyFile } from '../../utils/fileConvertChecks.js';
import styles from './FileConvert.module.css';

/**
 * Drag-and-drop/click file picker. Accepted files go to `onFiles`; readable
 * reasons for rejected ones go to `onReject`.
 */
export default function FileDropzone({ rules, multiple = false, disabled = false, title, compact = false, onFiles, onReject }) {
  const hintId = useId();
  const onDrop = useCallback((accepted, rejections) => {
    onReject(rejections.length ? describeRejections(rejections, rules) : []);
    if (accepted.length) onFiles(accepted);
  }, [onFiles, onReject, rules]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: rules.accept,
    maxSize: rules.maxFileSize,
    multiple,
    disabled,
    validator: rejectEmptyFile,
    onDrop,
  });

  const limits = [
    `Định dạng: ${rules.label}`,
    `tối đa ${formatBytes(rules.maxFileSize)}/file`,
    multiple ? `${rules.maxFiles} file, tổng ${formatBytes(rules.maxTotalSize)}` : 'một file mỗi lần',
  ].join(' · ');

  const className = [
    styles.dropzone,
    compact ? styles.dropzoneCompact : '',
    isDragActive ? styles.dropzoneActive : '',
    isDragReject ? styles.dropzoneReject : '',
    disabled ? styles.dropzoneDisabled : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      {...getRootProps({
        className,
        role: 'button',
        'aria-label': `${title}. Bấm Enter để chọn file`,
        'aria-describedby': hintId,
        'aria-disabled': disabled || undefined,
      })}
    >
      <input {...getInputProps()} />
      <FiUploadCloud className={styles.dropzoneIcon} aria-hidden="true" />
      <strong>{isDragActive ? (isDragReject ? 'Định dạng không được hỗ trợ' : 'Thả file vào đây') : title}</strong>
      <span id={hintId} className={styles.dropzoneHint}>{limits}</span>
    </div>
  );
}
