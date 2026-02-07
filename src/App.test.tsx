
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock Firebase modules
vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => true), // Return truthy to pass 'if (app)' check
    getApps: vi.fn(() => []), // Simulate no apps initialized
    getApp: vi.fn(),
}));

vi.mock('firebase/analytics', () => ({
    getAnalytics: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
    getAuth: vi.fn(() => ({})),
    signInAnonymously: vi.fn(),
    signInWithCustomToken: vi.fn(),
    onAuthStateChanged: vi.fn((auth, callback) => {
        callback({ uid: 'test-user' }); // Simulate logged-in user
        return () => { }; // Unsubscribe function
    }),
}));

vi.mock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => ({})),
    collection: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    onSnapshot: vi.fn(() => () => { }), // Return unsubscribe function
    query: vi.fn(),
}));

import App from './App';

describe('App', () => {
    it('renders correctly', () => {
        render(<App />);
        // Check for a known element from the App component (e.g., the title)
        // Note: The title might be different based on the tab, but "OptionFocus" is in the header.
        expect(screen.getByText(/OptionFocus/i)).toBeInTheDocument();
    });
});
