import React from 'react';
import { Outlet } from 'react-router-dom';
import useStore from '../contexts/store';
import { PublicLayout } from './PublicLayout';
import { PrivateLayout } from './PrivateLayout';

export function Layout() {
  const { isAuthenticated } = useStore();

  // Use different layouts based on authentication
  return isAuthenticated ? <PrivateLayout /> : <PublicLayout />;
}