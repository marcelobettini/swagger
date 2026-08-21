const spec = {
    openapi: '3.0.3',
    info: {
        title: 'Todo API',
        version: '0.0.1',
        description: 'API REST para gestión de tareas. CRUD completo con filtros y toggle de estado.',
    },
    servers: [{ url: '/api' }],
    tags: [
        { name: 'Auth', description: 'Registro, login y logout' },
        { name: 'Tasks', description: 'Operaciones sobre tareas' },
        { name: 'Health', description: 'Estado del servidor y la base de datos' },
    ],
    components: {
        securitySchemes: {
            // El access token viaja en una cookie httpOnly (no en el header
            // Authorization), por eso apiKey/in:cookie y no un esquema bearer.
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'accessToken',
                description: 'Cookie httpOnly seteada por /auth/login, válida 12hs. Swagger UI la envía sola (no hace falta "Authorize"). No hay renovación: al expirar, hay que loguearse de nuevo.',
            },
        },
        schemas: {
            Task: {
                type: 'object',
                properties: {
                    id: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0d' },
                    title: { type: 'string', example: 'Comprar leche' },
                    description: { type: 'string', example: 'Leche entera, 2 litros' },
                    priority: { type: 'string', enum: ['low', 'mid', 'high'], example: 'low' },
                    completed: { type: 'boolean', example: false },
                    userId: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0e', description: 'Id del usuario que creó la tarea' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string', example: '665f1a2b3c4d5e6f7a8b9c0e' },
                    firstName: { type: 'string', example: 'Ana' },
                    lastName: { type: 'string', example: 'Gómez' },
                    email: { type: 'string', format: 'email', example: 'ana@example.com' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            RegisterInput: {
                type: 'object',
                required: ['firstName', 'lastName', 'email', 'password'],
                properties: {
                    firstName: { type: 'string', example: 'Ana' },
                    lastName: { type: 'string', example: 'Gómez' },
                    email: { type: 'string', format: 'email', example: 'ana@example.com' },
                    password: { type: 'string', format: 'password', minLength: 8, example: 'contraseñaSegura123' },
                },
            },
            LoginInput: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email', example: 'ana@example.com' },
                    password: { type: 'string', format: 'password', example: 'contraseñaSegura123' },
                },
            },
            TaskInput: {
                type: 'object',
                required: ['title'],
                properties: {
                    title: { type: 'string', example: 'Comprar leche' },
                    description: { type: 'string', example: 'Leche entera, 2 litros' },
                    priority: { type: 'string', enum: ['low', 'mid', 'high'], default: 'low' },
                },
            },
            TaskPatch: {
                type: 'object',
                properties: {
                    title: { type: 'string', example: 'Comprar leche desnatada' },
                    description: { type: 'string', example: 'Sin lactosa' },
                    priority: { type: 'string', enum: ['low', 'mid', 'high'] },
                    completed: { type: 'boolean' },
                },
            },
            // Shape que devuelve el manejador de errores centralizado (src/middleware/errorHandler.js)
            // para cualquier error: los AppError que tiran las rutas (400/404) y también
            // los inesperados (500), JSON malformado (400), o CastError/ValidationError de Mongoose (400).
            ErrorStatus: {
                type: 'object',
                properties: {
                    status: { type: 'integer', example: 400 },
                    error: { type: 'string', example: 'Bad Request' },
                },
            },
        },
        responses: {
            NotFound: {
                description: 'Recurso no encontrado',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } },
            },
            BadRequest: {
                description: 'Datos de entrada inválidos',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } },
            },
            Unauthorized: {
                description: 'No autenticado (falta o venció la sesión)',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } },
            },
            Forbidden: {
                description: 'Autenticado, pero sin permiso sobre este recurso',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } },
            },
        },
    },
    paths: {
        '/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Registrar un usuario nuevo',
                description: 'Crea la cuenta pero no inicia sesión: llamar a /auth/login por separado.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
                },
                responses: {
                    201: {
                        description: 'Usuario creado',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                    409: {
                        description: 'Ya existe un usuario con ese email',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } },
                    },
                    429: { description: 'Demasiados intentos, probar más tarde' },
                },
            },
        },
        '/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Iniciar sesión',
                description: 'Si las credenciales son correctas, setea la cookie httpOnly accessToken (12hs). Sin refresh token: al expirar la cookie, hay que volver a hacer login.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
                },
                responses: {
                    200: {
                        description: 'Login exitoso',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                    401: { description: 'Credenciales inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } } },
                    429: { description: 'Demasiados intentos, probar más tarde' },
                },
            },
        },
        '/auth/logout': {
            post: {
                tags: ['Auth'],
                summary: 'Cerrar sesión',
                description: 'Limpia la cookie accessToken. No hay nada que revocar del lado del servidor (JWT stateless, sin refresh token) -no requiere estar autenticado.',
                responses: {
                    200: { description: 'Sesión cerrada' },
                },
            },
        },
        '/tasks': {
            get: {
                tags: ['Tasks'],
                summary: 'Listar tareas',
                description: 'Devuelve todas las tareas. Acepta filtros opcionales por estado y búsqueda de texto.',
                parameters: [
                    {
                        name: 'completed',
                        in: 'query',
                        description: 'Filtrar por estado de completado',
                        schema: { type: 'boolean' },
                    },
                    {
                        name: 'search',
                        in: 'query',
                        description: 'Buscar en title y description (insensible a mayúsculas)',
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    200: {
                        description: 'Lista de tareas',
                        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } },
                    },
                    404: {
                        description: 'No se encontraron tareas con los filtros aplicados',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorStatus' } } },
                    },
                },
            },
            post: {
                tags: ['Tasks'],
                summary: 'Crear tarea',
                description: 'Requiere estar autenticado. La tarea se crea con userId = usuario autenticado.',
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskInput' } } },
                },
                responses: {
                    201: {
                        description: 'Tarea creada',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                    401: { $ref: '#/components/responses/Unauthorized' },
                },
            },
        },
        '/tasks/{id}': {
            parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId de MongoDB' },
            ],
            get: {
                tags: ['Tasks'],
                summary: 'Obtener tarea por id',
                responses: {
                    200: {
                        description: 'Tarea encontrada',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
                    },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
            patch: {
                tags: ['Tasks'],
                summary: 'Actualizar tarea parcialmente',
                description: 'Requiere estar autenticado y ser el usuario que creó la tarea.',
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/TaskPatch' } } },
                },
                responses: {
                    200: {
                        description: 'Tarea actualizada',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
                    },
                    400: { $ref: '#/components/responses/BadRequest' },
                    401: { $ref: '#/components/responses/Unauthorized' },
                    403: { $ref: '#/components/responses/Forbidden' },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
            delete: {
                tags: ['Tasks'],
                summary: 'Eliminar tarea',
                description: 'Requiere estar autenticado y ser el usuario que creó la tarea.',
                security: [{ cookieAuth: [] }],
                responses: {
                    204: { description: 'Tarea eliminada' },
                    401: { $ref: '#/components/responses/Unauthorized' },
                    403: { $ref: '#/components/responses/Forbidden' },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/tasks/{id}/toggle': {
            parameters: [
                { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'ObjectId de MongoDB' },
            ],
            patch: {
                tags: ['Tasks'],
                summary: 'Invertir estado completed',
                description: 'Flip atómico: si completed era false pasa a true y viceversa. Actualiza updatedAt. Requiere estar autenticado y ser el usuario que creó la tarea.',
                security: [{ cookieAuth: [] }],
                responses: {
                    200: {
                        description: 'Tarea con estado invertido',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
                    },
                    401: { $ref: '#/components/responses/Unauthorized' },
                    403: { $ref: '#/components/responses/Forbidden' },
                    404: { $ref: '#/components/responses/NotFound' },
                },
            },
        },
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Estado del servidor',
                servers: [{ url: '/' }],
                responses: {
                    200: {
                        description: 'Servidor y base de datos operativos',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', example: 'ok' },
                                        db: { type: 'string', example: 'ok' },
                                        timestamp: { type: 'string', format: 'date-time' },
                                    },
                                },
                            },
                        },
                    },
                    503: {
                        description: 'Base de datos no disponible',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', example: 'error' },
                                        db: { type: 'string', example: 'unreachable' },
                                        timestamp: { type: 'string', format: 'date-time' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

export default spec;
