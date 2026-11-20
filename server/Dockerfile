FROM rust:1-slim AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -m office && mkdir /data && chown office /data
COPY --from=build /src/target/release/verkz-office-server /usr/local/bin/
USER office
ENV DATA_DIR=/data BIND=0.0.0.0:8080
EXPOSE 8080
CMD ["verkz-office-server"]
