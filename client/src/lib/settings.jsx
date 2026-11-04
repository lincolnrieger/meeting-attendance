/**
 * Organisation settings (name, terminology, form suggestions) shared by every
 * page. `useAppSettings()` returns:
 *   settings  raw values from /api/settings/app
 *   t         terminology helpers, e.g. t.Participants, t.events, t.Event
 *   save(v)   persist changes and update every page
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

export const DEFAULT_SETTINGS = {
  organisation_name: 'Attendance Register',
  participant_singular: 'Participant',
  participant_plural: 'Participants',
  event_singular: 'Meeting',
  event_plural: 'Meetings',
  role_suggestions: [],
  location_suggestions: [],
  title_suggestions: [],
};

export function termsFor(s) {
  const lower = (v) => v.toLowerCase();
  return {
    org: s.organisation_name,
    Participant: s.participant_singular,
    Participants: s.participant_plural,
    participant: lower(s.participant_singular),
    participants: lower(s.participant_plural),
    Event: s.event_singular,
    Events: s.event_plural,
    event: lower(s.event_singular),
    events: lower(s.event_plural),
  };
}

const SettingsContext = createContext({ settings: DEFAULT_SETTINGS, t: termsFor(DEFAULT_SETTINGS), save: async () => {} });
export const useAppSettings = () => useContext(SettingsContext);

/** Two-letter mark from the organisation name, e.g. "Riverside Scouts" → "RS". */
export function initials(name) {
  const words = String(name || '').split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  return ((words[0]?.[0] || 'A') + (words[1]?.[0] || words[0]?.[1] || 'R')).toUpperCase();
}

export function SettingsProvider({ enabled, children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!enabled) return;
    api.get('/settings/app').then((d) => setSettings(d.settings)).catch(() => {});
  }, [enabled]);

  useEffect(() => {
    document.title = settings.organisation_name;
  }, [settings.organisation_name]);

  const save = useCallback(async (values) => {
    const d = await api.put('/settings/app', values);
    setSettings(d.settings);
    return d.settings;
  }, []);

  const value = useMemo(() => ({ settings, t: termsFor(settings), save }), [settings, save]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
