import { supabase } from '../services/supabaseClient';

/**
 * Configuración de categorías iniciales por rubro.
 * Es fácil de extender para nuevos tipos de negocio como 'ALMACEN'.
 */
const INITIAL_CATEGORIES = {
  PERFUMERY: [
    { name: 'Fragancias', description: 'Perfumes, colonias y aguas de tocador.' },
    { name: 'Cuidado de la Piel', description: 'Cremas faciales, serums, limpiadores.' },
    { name: 'Maquillaje', description: 'Bases, labiales, sombras.' },
    { name: 'Cuidado Corporal', description: 'Cremas corporales, exfoliantes y aceites.' },
  ],
  SALON: [
    { name: 'Shampoos y Acondicionadores', description: 'Lavado y cuidado diario.' },
    { name: 'Tratamientos Capilares', description: 'Mascarillas intensivas, ampollas.' },
    { name: 'Fijación y Estilizado', description: 'Geles, ceras, espumas, lacas.' },
    { name: 'Coloración', description: 'Tinturas y tonalizadores.' },
    { name: 'Herramientas de Estilizado', description: 'Secadores, planchas, rizadores.' },
  ],
  ALL: [
    { name: 'Cuidado Capilar', description: 'Productos generales para el cabello.' },
    { name: 'Accesorios', description: 'Peines, brochas y complementos.' },
    { name: 'Kits y Promociones', description: 'Conjuntos de productos ofrecidos como un paquete.' },
  ],
  // Ejemplo de expansión futura:
  // ALMACEN: [
  //   { name: 'Lácteos', description: 'Leche, quesos, yogures.' },
  //   { name: 'Almacén', description: 'Arroz, fideos, aceites.' },
  // ]
};

/**
 * Siembra las categorías iniciales para una nueva cuenta.
 * @param {string} accountId - ID de la cuenta (tenant)
 */
export const seedInitialCategories = async (accountId) => {
  if (!accountId) return { success: false, error: 'Account ID requerido.' };

  try {
    // 1. Verificar si ya existen categorías para evitar duplicados
    const { count, error: countError } = await supabase
      .schema('core')
      .from('item_categories')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId);

    if (countError) throw countError;
    if (count > 0) return { success: true, message: 'La cuenta ya tiene categorías.' };

    // 2. Preparar el array plano de inserción
    const categoriesToInsert = [];
    
    Object.keys(INITIAL_CATEGORIES).forEach((scope) => {
      INITIAL_CATEGORIES[scope].forEach((cat) => {
        categoriesToInsert.push({
          account_id: accountId,
          name: cat.name,
          description: cat.description,
          applies_to: scope,
          is_deleted: false
        });
      });
    });

    // 3. Insertar en Supabase
    const { error: insertError } = await supabase
      .schema('core')
      .from('item_categories')
      .insert(categoriesToInsert);

    if (insertError) throw insertError;

    return { success: true, message: 'Categorías iniciales creadas correctamente.' };
  } catch (error) {
    console.error('Error al precargar categorías:', error.message);
    return { success: false, error: error.message };
  }
};
