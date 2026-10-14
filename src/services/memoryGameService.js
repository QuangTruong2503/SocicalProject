import { supabase } from '../lib/supabase.js';

async function call(name, payload = {}, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 8000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const { data, error } = await supabase.rpc(name, payload).abortSignal(controller.signal);
    if (error) return {
      data: null, code: error.code,
      unavailable: ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error.code),
      conflict: error.code === '40001',
      error: error.code === '42501' ? 'Tài khoản không có quyền sử dụng tính năng này.'
        : error.code === '22023' ? 'Ván chơi đã hết hạn hoặc thao tác không hợp lệ. Hãy tải lại thử thách.'
          : error.code === '55000' ? 'Hãy đợi hai thẻ úp lại rồi thử tiếp.'
            : 'Chưa kết nối được với tài khoản. Dữ liệu trên thiết bị vẫn được giữ lại.',
    };
    return { data, error: null };
  } catch {
    return { data: null, error: 'Mất kết nối. Bạn có thể thử lại khi có mạng.' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const loadMemoryAccount = (signal) => call('memory_game_load', {}, signal);
export const saveMemoryAccount = (document, version, signal) => call('memory_game_save', { p_document: document, p_expected_version: version }, signal);
export const startDailyMemory = (signal) => call('memory_game_daily_start', {}, signal);
export const revealDailyMemory = (id, index, signal) => call('memory_game_daily_reveal', { p_id: id, p_index: index }, signal);
export const loadMemoryLeaderboard = (day, signal) => call('memory_game_leaderboard', { p_day: day }, signal);
