# PostGIS 3.5 on PostgreSQL 16, plus pgvector 0.8.0 copied from the official pgvector image.
# No package downloads or compiling happen in this build; files are only copied between images.

# Stage 1: collect the pgvector files into /out, keeping their real paths.
# Bitcode (LLVM JIT) only exists if the base PostgreSQL was built with LLVM, so it is copied only if present.
FROM pgvector/pgvector:0.8.0-pg16 AS pgvector
RUN set -eu; \
    mkdir -p /out/usr/share/postgresql/16/extension /out/usr/lib/postgresql/16/lib; \
    cp /usr/share/postgresql/16/extension/vector.control /usr/share/postgresql/16/extension/vector--*.sql \
       /out/usr/share/postgresql/16/extension/; \
    cp /usr/lib/postgresql/16/lib/vector.so /out/usr/lib/postgresql/16/lib/; \
    if [ -d /usr/lib/postgresql/16/lib/bitcode/vector ]; then \
        mkdir -p /out/usr/lib/postgresql/16/lib/bitcode; \
        cp -r /usr/lib/postgresql/16/lib/bitcode/vector /out/usr/lib/postgresql/16/lib/bitcode/; \
        if [ -f /usr/lib/postgresql/16/lib/bitcode/vector.index.bc ]; then \
            cp /usr/lib/postgresql/16/lib/bitcode/vector.index.bc /out/usr/lib/postgresql/16/lib/bitcode/; \
        fi; \
    fi

# Stage 2: the actual database image.
FROM postgis/postgis:16-3.5
COPY --from=pgvector /out/ /
