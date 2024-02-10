import { RouteConfig } from "@medusajs/admin"
import { RocketLaunch, Spinner } from "@medusajs/icons"
import { useAdminCustomQuery } from 'medusa-react';
import { Table, Heading, StatusBadge, Container, } from '@medusajs/ui';
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";


const CustomPage = () => {
  const { data } = useAdminCustomQuery("/sendcloud/parcels", ['fetch-parcels'])

  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 10
  const pageCount = Math.ceil(data?.parcels?.length / pageSize)
  const canNextPage = useMemo(
    () => currentPage < pageCount - 1,
    [currentPage, pageCount]
  )
  const canPreviousPage = useMemo(() => currentPage - 1 >= 0, [currentPage])

  const nextPage = () => {
    if (canNextPage) {
      setCurrentPage(currentPage + 1)
    }
  }

  const previousPage = () => {
    if (canPreviousPage) {
      setCurrentPage(currentPage - 1)
    }
  }

  const currentParcels = useMemo(() => {
    const offset = currentPage * pageSize
    const limit = Math.min(offset + pageSize, data?.parcels?.length)

    return data?.parcels?.slice(offset, limit)
  }, [currentPage, pageSize, data])


  if (currentParcels && currentParcels.length) {
    return (
      <Container>
        <Heading className="mb-8" level="h2">Shipments</Heading>

        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>#</Table.HeaderCell>
              <Table.HeaderCell>Customer Email</Table.HeaderCell>
              <Table.HeaderCell>Customer Name</Table.HeaderCell>
              <Table.HeaderCell>Order #</Table.HeaderCell>
              <Table.HeaderCell>Zip</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Tracking #</Table.HeaderCell>
              <Table.HeaderCell>Track URL</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {currentParcels.map((parcel) => {
              return (
                <Table.Row>
                  <Table.Cell>{parcel.id}</Table.Cell>
                  <Table.Cell>{parcel.email}</Table.Cell>
                  <Table.Cell>{parcel.name}</Table.Cell>
                  <Table.Cell>{parcel.order_number}</Table.Cell>
                  <Table.Cell>{parcel.postal_code}</Table.Cell>
                  <Table.Cell>{parcel.parcel_items.length}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={parcel.status.id == 2000 ? "grey" : parcel.status.id == 1000 ? "green" : "blue"}>
                      {parcel.status.message}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    {parcel.tracking_number}
                  </Table.Cell>
                  <Table.Cell>
                    <Link to={parcel.tracking_url} target="_blank" >
                      <p className="text-blue-600">
                        Track
                      </p>
                    </Link>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>

          <Table.Pagination
            count={data.parcels.length}
            pageSize={pageSize}
            pageIndex={currentPage}
            pageCount={data.parcels.length}
            canPreviousPage={canPreviousPage}
            canNextPage={canNextPage}
            previousPage={previousPage}
            nextPage={nextPage}
          >

          </Table.Pagination>
        </Table>
      </Container>
    )
  } else {
    return (
      <Spinner className="animate-spin" />
    )
  }
}


export const config: RouteConfig = {
  link: {
    label: "Shipments",
    icon: RocketLaunch,
  },
}


export default CustomPage