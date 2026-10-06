import { useEffect, useState } from 'react';
import type { SurveyQuestion } from '@/types';

interface Props {
  lessonId: number;
  questions: SurveyQuestion[];
  submitted: boolean;
  submitting: boolean;
  onSubmit: (answers: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}
export default function LessonSurvey({ lessonId, questions, submitted, submitting, onSubmit, onClose }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  useEffect(() => { setAnswers({}); setError(''); }, [lessonId]);
  return (
    <section className="my-5 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900" aria-labelledby="lesson-survey-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="lesson-survey-heading" className="text-lg font-bold">Khảo sát bài học</h2>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>Để sau</button>
      </div>
      {submitted ? <p role="status">Đã lưu câu trả lời của bạn.</p> : (
        <form className="space-y-5" onSubmit={async event => { event.preventDefault(); setError(''); const response = await onSubmit(answers); if (!response.success) setError(response.error || 'Chưa gửi được khảo sát.'); }}>
          {questions.map(question => (
            <fieldset key={question.id} className="space-y-2">
              <legend className="mb-2 font-semibold">{question.text}{question.required !== false ? ' *' : ''}</legend>
              {question.type === 'single_choice' ? question.options?.map(option => (
                <label key={option.value} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <input type="radio" name={question.id} value={option.value} required={question.required !== false} checked={answers[question.id] === option.value} onChange={() => setAnswers(old => ({ ...old, [question.id]: option.value }))} />
                  {option.label}
                </label>
              )) : <textarea aria-label={question.text} className="w-full rounded-lg border border-slate-300 p-3" rows={3} maxLength={5000} required={question.required !== false} value={answers[question.id] || ''} onChange={event => setAnswers(old => ({ ...old, [question.id]: event.target.value }))} />}
            </fieldset>
          ))}
          {error ? <p role="alert" className="text-red-600">{error}</p> : null}
          <button type="submit" disabled={submitting} className="rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{submitting ? 'Đang gửi…' : 'Gửi khảo sát'}</button>
        </form>
      )}
    </section>
  );
}
