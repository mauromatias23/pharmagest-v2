
import { Product, Batch, ProductPriceType, User, UserRole } from '../types';

export const INITIAL_USERS: User[] = [
  { id: 'u-admin', name: 'Administrador', role: UserRole.ADMIN, active: true, password: '1111' },
  { id: 'u-f1', name: 'Funcionario 1', role: UserRole.CASHIER, active: true, password: '2222' },
  { id: 'u-f2', name: 'Funcionario 2', role: UserRole.CASHIER, active: true, password: '3333' }
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'p1',
    code: '789101',
    name: 'Paracetamol 500mg',
    activeIngredient: 'Paracetamol',
    category: 'Analgésicos',
    type: 'Comprimidos',
    priceType: ProductPriceType.CAPPED,
    costPrice: 500,
    sellPrice: 1200,
    hasVAT: false,
    supplier: 'Genéricos AO',
    minStock: 50,
    totalQuantity: 150,
    active: true
  },
  {
    id: 'p2',
    code: '789102',
    name: 'Amoxicilina 875mg',
    activeIngredient: 'Amoxicilina',
    category: 'Antibióticos',
    type: 'Comprimidos',
    priceType: ProductPriceType.FREE,
    costPrice: 2000,
    sellPrice: 4500,
    hasVAT: true,
    supplier: 'Distribuidora Global',
    minStock: 20,
    totalQuantity: 80,
    active: true
  },
  {
    id: 'p3',
    code: '789103',
    name: 'Artemeter + Lumefantrina',
    activeIngredient: 'Coartem',
    category: 'Antimaláricos',
    type: 'Comprimidos',
    priceType: ProductPriceType.CAPPED,
    costPrice: 800,
    sellPrice: 1500,
    hasVAT: false,
    supplier: 'MINSA Central',
    minStock: 100,
    totalQuantity: 20,
    active: true
  }
];

export const INITIAL_BATCHES: Batch[] = [
  { id: 'b1', productId: 'p1', lotNumber: 'L2401', expiryDate: '2025-12-31', quantity: 100, entryDate: '2024-01-10' },
  { id: 'b2', productId: 'p1', lotNumber: 'L2402', expiryDate: '2025-06-30', quantity: 50, entryDate: '2024-02-15' },
  { id: 'b3', productId: 'p2', lotNumber: 'AMX-99', expiryDate: '2024-05-15', quantity: 80, entryDate: '2024-01-05' },
  { id: 'b4', productId: 'p3', lotNumber: 'CO-001', expiryDate: '2024-03-20', quantity: 20, entryDate: '2024-01-20' }
];
