// src/dtos/pagination.dtos.ts

/**
 * Interface for pagination metadata.
 */
export interface PaginationMeta {
    totalItems: number;
    itemCount: number; // Number of items in the current page
    itemsPerPage: number;
    totalPages: number;
    currentPage: number;
}

/**
 * Generic DTO for paginated results.
 * Contains the data for the current page and pagination metadata.
 */
export interface PaginationDto<T> {
    data: T[];
    meta: PaginationMeta;
    // Optionally, include links for HATEOAS (next, previous, first, last)
    // links?: {
    //     first?: string;
    //     previous?: string;
    //     next?: string;
    //     last?: string;
    // };
}

interface CreatePaginationResultParams {
    totalItems: number;
    currentPage: number;
    itemsPerPage: number;
}

/**
 * Utility function to create a paginated result object.
 *
 * @param items - The array of items for the current page.
 * @param params - Object containing totalItems, currentPage, and itemsPerPage.
 * @returns A PaginationDto object.
 */
export function createPaginationResult<T>(
    items: T[],
    params: CreatePaginationResultParams
): PaginationDto<T> {
    const { totalItems, currentPage, itemsPerPage } = params;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    return {
        data: items,
        meta: {
            totalItems: totalItems,
            itemCount: items.length,
            itemsPerPage: itemsPerPage,
            totalPages: totalPages,
            currentPage: currentPage,
        },
        // links: {
        //     first: currentPage > 1 ? `?page=1&limit=${itemsPerPage}` : undefined,
        //     previous: currentPage > 1 ? `?page=${currentPage - 1}&limit=${itemsPerPage}` : undefined,
        //     next: currentPage < totalPages ? `?page=${currentPage + 1}&limit=${itemsPerPage}` : undefined,
        //     last: currentPage < totalPages ? `?page=${totalPages}&limit=${itemsPerPage}` : undefined,
        // }
    };
}