export const ROLE_LABELS = {
  admin: 'Admin',
  owner: 'Owner',
  restaurant: 'Restaurant Staff',
  hotel: 'Hotel Staff',
  staff: 'Staff',
};

export const BUILTIN_ROLES = [
  { code: 'admin', label: 'Admin' },
  { code: 'owner', label: 'Owner' },
  { code: 'hotel', label: 'Hotel Staff' },
  { code: 'restaurant', label: 'Restaurant Staff' },
  { code: 'staff', label: 'Staff' },
];

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '';
}
