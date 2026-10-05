import React from 'react';
import { createPortal } from 'react-dom';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Dialog } from '@base-ui/react/dialog';

const h = React.createElement;
export const text = {
  cancel: 'Hủy', confirm: 'Xác nhận', remove: 'Xóa', close: 'Đóng',
  confirmTitle: 'Xác nhận thao tác', inputTitle: 'Nhập thông tin',
  table: 'Xem bảng', chart: 'Xem biểu đồ', empty: 'Không có dữ liệu trong khoảng này',
  saved: 'Đã lưu thay đổi', created: 'Đã thêm dữ liệu', deleted: 'Đã xóa dữ liệu',
  failed: 'Không thực hiện được thao tác', loading: 'Đang tải dữ liệu',
};

export function Select({ children, value, defaultValue, onChange, className = 'ui-input', title, ...props }) {
  const options = React.Children.toArray(children).filter(React.isValidElement).map(child => ({
    value: child.props.value, label: child.props.children, disabled: child.props.disabled,
  }));
  return h(BaseSelect.Root, {
    value, defaultValue, name: props.name, disabled: props.disabled, required: props.required,
    items: options, multiple: props.multiple,
    onValueChange: next => onChange?.({ target: { value: next ?? '', selectedOptions: Array.isArray(next) ? next.map(value => ({ value })) : [] } }),
  },
    h(BaseSelect.Trigger, { className: `${className} ui-select`, title, 'aria-label': props['aria-label'] || title || (typeof options[0]?.label === 'string' ? options[0].label : undefined), style: props.style },
      h(BaseSelect.Value), h(BaseSelect.Icon, { className: 'select-chevron' }, '⌄')),
    h(BaseSelect.Portal, null, h(BaseSelect.Positioner, { className: 'select-positioner', sideOffset: 4, alignItemWithTrigger: false },
      h(BaseSelect.Popup, { className: 'select-popup' }, h(BaseSelect.List, null,
        options.map(option => h(BaseSelect.Item, { key: String(option.value), value: option.value, disabled: option.disabled, className: 'select-item' },
          h(BaseSelect.ItemText, null, option.label), h(BaseSelect.ItemIndicator, { className: 'select-check' }, '✓'))))))));
}

let pending = null;
const listeners = new Set();
const toastListeners = new Set();
export function notify(message, error = false) { toastListeners.forEach(fn => fn({ message, error, id: Date.now() })); }
function requestDialog(config) {
  if (pending) return Promise.resolve(config.input ? null : false);
  return new Promise(resolve => { pending = { ...config, resolve }; listeners.forEach(fn => fn(pending)); });
}
export function confirmAction(message, destructive = true) { return requestDialog({ message, destructive }); }
export function requestText(message, value = '') { return requestDialog({ message, input: true, value, destructive: /xoa|xóa/i.test(message) }); }

export function FeedbackHost() {
  const [dialog, setDialog] = React.useState(null);
  const [value, setValue] = React.useState('');
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    const listener = next => { setDialog(next); setValue(next.value || ''); };
    listeners.add(listener); toastListeners.add(setToast);
    return () => { listeners.delete(listener); toastListeners.delete(setToast); };
  }, []);
  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  function finish(accepted) {
    const current = pending; pending = null; setDialog(null);
    current?.resolve(accepted ? (current.input ? value : true) : (current?.input ? null : false));
  }
  return h(React.Fragment, null,
    h(Dialog.Root, { open: !!dialog, onOpenChange: open => { if (!open) finish(false); } },
      h(Dialog.Portal, null,
        h(Dialog.Backdrop, { className: 'dialog-backdrop' }),
        h(Dialog.Popup, { className: 'ui-dialog', initialFocus: dialog?.input ? undefined : () => document.getElementById('dialog-cancel') },
          h('div', { className: 'dialog-head' }, h(Dialog.Title, null, dialog?.input ? text.inputTitle : text.confirmTitle)),
          h('form', { onSubmit: event => { event.preventDefault(); finish(true); } },
            h('div', { className: 'dialog-body' }, h(Dialog.Description, null, dialog?.message),
              dialog?.input ? h('input', { className: 'ui-input', value, onChange: event => setValue(event.target.value), 'aria-label': dialog.message, autoFocus: true }) : null),
            h('div', { className: 'dialog-footer' },
              h('button', { id: 'dialog-cancel', className: 'ui-button ui-button-outline', type: 'button', onClick: () => finish(false) }, text.cancel),
              h('button', { className: `ui-button ui-button-${dialog?.destructive ? 'destructive' : 'default'}`, type: 'submit' }, dialog?.destructive ? text.remove : text.confirm)))))),
    toast ? h('div', { className: 'ui-toast', role: toast.error ? 'alert' : 'status' },
      h('span', { 'aria-hidden': true }, toast.error ? '!' : '✓'), toast.message,
      h('button', { onClick: () => setToast(null), 'aria-label': text.close }, '×')) : null);
}

export function Skeleton() {
  return h('div', { className: 'skeleton-stack', role: 'status', 'aria-label': text.loading },
    h('span', { className: 'sr-only' }, text.loading), ...[1, 2, 3, 4].map(i => h('div', { key: i, className: 'skeleton-row' })));
}

export function MoneyInput({ value, onChange, ...props }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const display = value === '' || value == null ? '' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(value));
  return h('div', { className: 'money-input' }, h('input', {
    ...props, type: 'text', inputMode: 'decimal', className: 'ui-input', value: editing ? draft : display,
    onFocus: () => { setEditing(true); setDraft(display); },
    onBlur: () => setEditing(false),
    onChange: event => {
      const raw = event.target.value; setDraft(raw);
      const normalized = raw.replace(/\./g, '').replace(',', '.');
      if (/^\d*(\.\d{0,2})?$/.test(normalized)) onChange?.({ target: { value: normalized } });
    },
  }), h('span', null, '₫'));
}

export function SaveBar({ dirty, saving, onSave, onDiscard }) {
  React.useEffect(() => {
    if (!dirty) return;
    const guard = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  if (!dirty) return null;
  return createPortal(h('div', { className: 'save-bar', role: 'region', 'aria-label': 'Thay đổi chưa lưu' },
    h('span', null, 'Thay đổi chưa lưu'), h('div', null,
      h('button', { className: 'ui-button ui-button-outline', onClick: onDiscard, disabled: saving }, 'Hủy'),
      h('button', { className: 'ui-button ui-button-default', onClick: onSave, disabled: saving }, saving ? 'Đang lưu…' : 'Lưu'))), document.body);
}

export function Overlay({ children, className }) {
  const parts = React.Children.toArray(children);
  const backdrop = parts.find(child => child.props?.className?.includes('drawer-backdrop'));
  const panel = parts.find(child => child.props?.role === 'dialog');
  const content = parts.map(child => child.props?.role === 'dialog' ? React.cloneElement(child, { role: undefined, 'aria-modal': undefined }) : child);
  return h(Dialog.Root, { open: true, onOpenChange: open => { if (!open) backdrop?.props.onClick?.(); } },
    h(Dialog.Portal, null, h(Dialog.Popup, { className, 'aria-label': panel ? undefined : 'Chi tiết', 'aria-labelledby': panel?.props['aria-labelledby'] }, content)));
}

export function Page({ title, subtitle, group, label, children, width = 'default' }) {
  return h(React.Fragment, null,
    h('div', { className: 'page-header-react', 'data-width': width }, h('div', { className: 'title-block' },
      h('div', { className: 'breadcrumb' }, h('span', null, group), h('span', { 'aria-hidden': true }, '/'), h('span', null, label)),
      h('div', { className: 'title-row' }, h('h1', null, title)), subtitle ? h('p', null, subtitle) : null)),
    h('section', { className: 'content-frame react-content', 'data-width': width }, children));
}

export function EmptyState({ title = 'Chưa có dữ liệu', description = 'Dữ liệu sẽ xuất hiện tại đây khi có hoạt động mới.', onClear }) {
  return h('div', { className: 'empty-state' },
    h('span', { className: 'empty-state-icon', 'aria-hidden': true }, '☷'),
    h('strong', null, title), h('p', null, description),
    onClear ? h('button', { className: 'ui-button ui-button-default', onClick: onClear }, 'Xóa bộ lọc') : null);
}
