# `select:false` vs. `toJSON` en Mongoose

## Idea central

Ambos mecanismos protegen el `passwordHash`, pero en **capas diferentes**:

```text
MongoDB → Mongoose/Node.js → HTTP Response
             ↑                  ↑
        select:false         toJSON
```

- **`select:false`**: evita que `passwordHash` sea recuperado por queries normales.
- **`toJSON`**: evita que `passwordHash` aparezca en la representación JSON enviada al cliente.

## ¿Por qué `select:false` tiene valor práctico?

Aunque `toJSON` impida que el hash salga por HTTP, sin `select:false` el dato ya habría entrado en memoria dentro del proceso Node.js.

Eso aumenta innecesariamente la superficie de exposición.

### Riesgos que reduce

1. **Logging accidental**
   - Un `logger.info({ user })` podría registrar información sensible.
   - Los logs pueden persistir en sistemas externos y backups.

2. **Propagación interna innecesaria**
   - El objeto con el hash puede ser enviado a otros servicios o funciones que no lo necesitan.

3. **Errores futuros**
   - Reduce el impacto de olvidos o cambios de código que omitan el `toJSON`, usen otra serialización o conviertan el documento de otra manera.

4. **Principio de mínimo privilegio**
   - El hash solo está disponible para los casos de uso que explícitamente lo necesitan.

## Patrón recomendado

```js
passwordHash: {
    type: String,
    required: true,
    select: false
}
```

En el flujo normal:

```js
const user = await User.findById(id);
```

El `passwordHash` no se recupera.

En autenticación:

```js
const user = await User
    .findOne({ email })
    .select('+passwordHash');
```

La excepción queda explícita y es fácilmente auditable.

## Defense in depth

| Mecanismo | Capa | Función |
|---|---|---|
| `select:false` | DB → aplicación | Evita recuperar el secreto por defecto |
| `.select('+passwordHash')` | Caso de uso | Permite acceso explícito cuando es necesario |
| `toJSON` | Aplicación → API | Evita exponer el secreto en respuestas JSON |

## Importante

`select:false` **no es una barrera de seguridad absoluta**. Un código con permisos suficientes puede solicitar explícitamente:

```js
.select('+passwordHash')
```

Su objetivo es reducir **acceso accidental o innecesario**, no impedir el acceso privilegiado.

## Conclusión

La combinación de ambos mecanismos es una buena práctica:

> **`select:false` evita que el secreto entre al sistema por defecto; `toJSON` evita que, si está presente, salga accidentalmente por la API.**

Esto aplica los principios de:

- **Defense in depth**
- **Least privilege**
- **Secure by default**
- **Data minimization**
